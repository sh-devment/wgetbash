package main

import (
	"bytes"
	"embed"
	"fmt"
	"html/template"
	"io/fs"
	"log"
	"net/http"
	"os"
)

//go:embed static
var staticFiles embed.FS

var buildTime = "dev"

func main() {
	if len(os.Args) > 1 && os.Args[1] == "--version" {
		fmt.Println(buildTime)
		return
	}

	initRegion()
	initDB()
	index := renderIndex()

	mux := http.NewServeMux()

	// Auth
	mux.HandleFunc("GET /auth/login", handleLogin)
	mux.HandleFunc("GET /auth/me", handleMe)
	mux.HandleFunc("POST /auth/logout", handleLogout)
	mux.HandleFunc("GET /auth/delegate", requireAuth(handleDelegate))

	// API (protected)
	mux.HandleFunc("GET /api/groups", requireAuth(handleGetGroups))
	mux.HandleFunc("POST /api/groups", requireAuth(handleCreateGroup))
	mux.HandleFunc("PUT /api/groups/{id}", requireAuth(handleUpdateGroup))
	mux.HandleFunc("DELETE /api/groups/{id}", requireAuth(handleDeleteGroup))
	mux.HandleFunc("GET /api/groups/{id}/scripts", requireAuth(handleGetScripts))
	mux.HandleFunc("POST /api/groups/{id}/scripts", requireAuth(handleCreateScript))
	mux.HandleFunc("PUT /api/scripts/{id}", requireAuth(handleUpdateScript))
	mux.HandleFunc("PUT /api/scripts/{id}/private", requireAuth(handleSetScriptPrivate))
	mux.HandleFunc("DELETE /api/scripts/{id}", requireAuth(handleDeleteScript))

	// Public script endpoint
	mux.HandleFunc("GET /run/{userHash}/{scriptHash}", handleRunScript)

	// Static files — root also handles OAuth callback (?code=...)
	staticFS, _ := fs.Sub(staticFiles, "static")
	fileServer := http.FileServer(http.FS(staticFS))
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("code") != "" {
			handleCallback(w, r)
			return
		}
		if r.URL.Path == "/" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write(index)
			return
		}
		fileServer.ServeHTTP(w, r)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}

	log.Printf("wgetbash listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

// renderIndex fills static/index.html with the region's login page texts.
// The texts are fixed for the life of the process, so it runs once at startup
// and a broken template stops the process instead of serving a blank page.
// /index.html itself is redirected to / by the file server, so this is the
// only way the page is served.
func renderIndex() []byte {
	tpl, err := template.ParseFS(staticFiles, "static/index.html")
	if err != nil {
		log.Fatalf("parse index.html: %v", err)
	}
	var buf bytes.Buffer
	if err := tpl.Execute(&buf, texts); err != nil {
		log.Fatalf("render index.html: %v", err)
	}
	return buf.Bytes()
}
