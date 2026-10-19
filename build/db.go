package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

var db *sql.DB

func initDB() {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./wgetbash.db"
	}

	// create parent directory if it doesn't exist
	if dir := filepath.Dir(dbPath); dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			log.Fatalf("create db dir: %v", err)
		}
	}

	var err error
	db, err = sql.Open("sqlite", dbPath+"?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)")
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	db.SetMaxOpenConns(1)

	if err := migrate(); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	log.Printf("db ready: %s", dbPath)
}

func seedDemoContent(userID int64) {
	// only seed if user has no groups yet
	var count int
	db.QueryRow(`SELECT COUNT(*) FROM groups WHERE user_id = ?`, userID).Scan(&count)
	if count > 0 {
		return
	}

	res, err := db.Exec(`INSERT INTO groups (user_id, name) VALUES (?, ?)`, userID, region.DemoGroup)
	if err != nil {
		return
	}
	gid, _ := res.LastInsertId()

	// Demo content for a new user, in the language of the region
	// (region-ru.go / region-com.go).
	//
	// The list is ordered by updated_at DESC, so identical timestamps would show
	// these bottom-up. Stagger them a second apart — first in DemoScripts is
	// newest — so they read top-down in teaching order.
	now := time.Now().Unix()
	for i, s := range region.DemoScripts {
		db.Exec(
			`INSERT INTO scripts (group_id, name, content, hash, private, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
			gid, s.name, s.content, newHash(), s.private, now-int64(i),
		)
	}
}

func migrate() error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id        INTEGER PRIMARY KEY AUTOINCREMENT,
			auth_id   TEXT    UNIQUE NOT NULL,
			username  TEXT    NOT NULL DEFAULT '',
			user_hash TEXT    UNIQUE NOT NULL DEFAULT '',
			provider  TEXT    NOT NULL DEFAULT ''
		);
		CREATE TABLE IF NOT EXISTS groups (
			id      INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			name    TEXT    NOT NULL
		);
		CREATE TABLE IF NOT EXISTS scripts (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
			name       TEXT    NOT NULL DEFAULT '',
			content    TEXT    NOT NULL DEFAULT '',
			hash       TEXT    UNIQUE NOT NULL,
			private    INTEGER NOT NULL DEFAULT 0,
			updated_at INTEGER NOT NULL DEFAULT 0
		);
	`)
	if err != nil {
		return err
	}

	// Column migrations for databases created before a column existed. Each is
	// skipped when the column is already present, so they stay here permanently
	// and every error that does come back is a real one.
	cols := []struct{ table, column, definition string }{
		{"users", "user_hash", "user_hash TEXT NOT NULL DEFAULT ''"},
		{"users", "provider", "provider TEXT NOT NULL DEFAULT ''"},
		// private = 0 keeps every existing script publicly runnable, as before
		{"scripts", "private", "private INTEGER NOT NULL DEFAULT 0"},
		// SQLite rejects CURRENT_TIMESTAMP as an ADD COLUMN default, so the
		// column arrives at 0 and backfillUpdatedAt stamps the existing rows.
		{"scripts", "updated_at", "updated_at INTEGER NOT NULL DEFAULT 0"},
	}
	for _, c := range cols {
		if err := addColumn(c.table, c.column, c.definition); err != nil {
			return err
		}
	}

	return backfillUpdatedAt()
}

// hasColumn reports whether table already has the named column. This is the
// precondition that lets addColumn fail loudly: once we know the column is
// missing, any error from ADD COLUMN is a genuine failure rather than the
// harmless "duplicate column name" of a second startup.
func hasColumn(table, column string) (bool, error) {
	rows, err := db.Query(`SELECT name FROM pragma_table_info(?)`, table)
	if err != nil {
		return false, err
	}
	defer rows.Close()
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return false, err
		}
		if name == column {
			return true, nil
		}
	}
	return false, rows.Err()
}

// addColumn applies an ALTER TABLE only when the column is missing. table and
// definition come from the constant table in migrate(), never from user input.
func addColumn(table, column, definition string) error {
	has, err := hasColumn(table, column)
	if err != nil {
		return fmt.Errorf("inspect %s.%s: %w", table, column, err)
	}
	if has {
		return nil
	}
	if _, err := db.Exec(`ALTER TABLE ` + table + ` ADD COLUMN ` + definition); err != nil {
		return fmt.Errorf("add %s.%s: %w", table, column, err)
	}
	log.Printf("migrate: added %s.%s", table, column)
	return nil
}

// backfillUpdatedAt stamps rows that predate scripts.updated_at. It is guarded
// by `WHERE updated_at = 0` and kept permanently rather than run once and
// deleted: migrate() is the only thing that upgrades a database, so a restored
// old backup or an idle dev copy still needs it. Every INSERT sets updated_at,
// so after the first run this matches nothing.
func backfillUpdatedAt() error {
	res, err := db.Exec(`UPDATE scripts SET updated_at = ? WHERE updated_at = 0`, time.Now().Unix())
	if err != nil {
		return fmt.Errorf("backfill scripts.updated_at: %w", err)
	}
	if n := affected(res); n > 0 {
		log.Printf("migrate: stamped %d script(s) with updated_at", n)
	}
	return nil
}
