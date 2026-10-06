package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	UserID int64 `json:"user_id"`
	jwt.RegisteredClaims
}

type contextKey string

const ctxUserID contextKey = "userID"

// ── JWT ──

func secretKey() []byte { return []byte(os.Getenv("SECRET_KEY")) }

func makeToken(userID int64) (string, error) {
	claims := Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(30 * 24 * time.Hour)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secretKey())
}

func parseToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return secretKey(), nil
	})
	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}
	return token.Claims.(*Claims), nil
}

// ── Cookie ──

func setCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   30 * 24 * 3600,
	})
}

func clearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: "session", Value: "", Path: "/", MaxAge: -1})
}

// ── Middleware ──

func requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session")
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		claims, err := parseToken(cookie.Value)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), ctxUserID, claims.UserID)
		next(w, r.WithContext(ctx))
	}
}

func userIDFromCtx(r *http.Request) int64 {
	return r.Context().Value(ctxUserID).(int64)
}

// sessionUserID reads the session cookie without enforcing it — for routes that
// are public by default but need to know who (if anyone) is logged in.
func sessionUserID(r *http.Request) (int64, bool) {
	cookie, err := r.Cookie("session")
	if err != nil {
		return 0, false
	}
	claims, err := parseToken(cookie.Value)
	if err != nil {
		return 0, false
	}
	return claims.UserID, true
}

// ── Auth handlers ──

func handleLogin(w http.ResponseWriter, r *http.Request) {
	url := os.Getenv("AUTH_URL") + "/?redirect=" + os.Getenv("APP_URL") + "/"
	http.Redirect(w, r, url, http.StatusFound)
}

func handleCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "missing code", http.StatusBadRequest)
		return
	}

	body, _ := json.Marshal(map[string]string{
		"app_token": os.Getenv("APP_TOKEN"),
		"code":      code,
	})
	resp, err := http.Post(os.Getenv("AUTH_INTERNAL")+"/exchange", "application/json", bytes.NewReader(body))
	if err != nil || resp.StatusCode != http.StatusOK {
		http.Error(w, "auth exchange failed", http.StatusUnauthorized)
		return
	}
	defer resp.Body.Close()

	// auth service returns { ok, user: { id, name, email, ... }, method }
	var payload struct {
		User   map[string]any `json:"user"`
		Method string         `json:"method"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil || payload.User == nil {
		http.Error(w, "invalid response", http.StatusInternalServerError)
		return
	}

	authID := fmt.Sprintf("%v", payload.User["id"])
	username := extractUsername(payload.User)
	provider := payload.Method

	// insert user if new (ignore conflict)
	db.Exec(
		`INSERT INTO users (auth_id, username, user_hash, provider) VALUES (?, ?, ?, ?) ON CONFLICT(auth_id) DO NOTHING`,
		authID, username, randToken(), provider,
	)
	// keep username/provider fresh from the auth service on each login
	db.Exec(
		`UPDATE users SET username = ?, provider = ? WHERE auth_id = ?`,
		username, provider, authID,
	)
	// ensure user_hash for existing users that have none
	db.Exec(
		`UPDATE users SET user_hash = ? WHERE auth_id = ? AND (user_hash IS NULL OR user_hash = '')`,
		randToken(), authID,
	)

	var userID int64
	if err := db.QueryRow(`SELECT id FROM users WHERE auth_id = ?`, authID).Scan(&userID); err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	seedDemoContent(userID)

	token, err := makeToken(userID)
	if err != nil {
		http.Error(w, "token error", http.StatusInternalServerError)
		return
	}
	setCookie(w, token)
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func handleMe(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session")
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	claims, err := parseToken(cookie.Value)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var username, userHash, authID, provider string
	if err := db.QueryRow(`SELECT username, user_hash, auth_id, provider FROM users WHERE id = ?`, claims.UserID).Scan(&username, &userHash, &authID, &provider); err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	writeJSON(w, map[string]any{"id": claims.UserID, "username": username, "user_hash": userHash, "uid": authID, "provider": provider})
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	clearCookie(w)
	writeJSON(w, map[string]any{"ok": true})
}

// menuURL is app B — the app we delegate the logged-in user to. Every app
// lives on the same subdomain in both zones and SSO works only within one
// zone, so the menu's domain follows REGION (ru | com, set by the deploy matrix).
func menuURL() string {
	region := os.Getenv("REGION")
	if region == "" {
		region = "ru"
	}
	return "https://menu.sh-development." + region + "/"
}

// handleDelegate forwards the current user to the menu app via auth-center.
// It calls POST {AUTH_INTERNAL}/delegate with the user's id, name and provider
// so app B renders the real name (not "no name"), then redirects to app B with
// the returned one-time code.
func handleDelegate(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromCtx(r)

	var authID, username, provider string
	if err := db.QueryRow(`SELECT auth_id, username, provider FROM users WHERE id = ?`, userID).Scan(&authID, &username, &provider); err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	if provider == "" {
		provider = "delegate"
	}
	body, _ := json.Marshal(map[string]string{
		"user_id":    authID,
		"app_token":  os.Getenv("APP_TOKEN"),
		"method":     provider,
		"name":       username, // Google-style display name
		"first_name": username, // Telegram/Solana-style fallback
	})
	resp, err := http.Post(os.Getenv("AUTH_INTERNAL")+"/delegate", "application/json", bytes.NewReader(body))
	if err != nil || resp.StatusCode != http.StatusOK {
		http.Error(w, "delegate failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	var payload struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil || payload.Code == "" {
		http.Error(w, "invalid delegate response", http.StatusBadGateway)
		return
	}

	http.Redirect(w, r, menuURL()+"?code="+url.QueryEscape(payload.Code), http.StatusFound)
}

// ── Helpers ──

func extractUsername(data map[string]any) string {
	if v, _ := data["username"].(string); v != "" {
		return v
	}
	if v, _ := data["name"].(string); v != "" {
		return v
	}
	first, _ := data["first_name"].(string)
	last, _ := data["last_name"].(string)
	if name := strings.TrimSpace(first + " " + last); name != "" {
		return name
	}
	if email, _ := data["email"].(string); email != "" {
		return strings.SplitN(email, "@", 2)[0]
	}
	return "no name"
}

func randToken() string {
	b := make([]byte, 12)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}
