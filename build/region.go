package main

import (
	"html/template"
	"log"
	"os"
)

// regionTexts is everything that differs between the ru and com deployments:
// the zone of the sibling apps, the login page and the demo content a new user
// is seeded with. The values live in region-ru.go and region-com.go; the rest
// of the UI is English in both and stays in static/.
type regionTexts struct {
	Lang string // <html lang>
	Zone string // domain zone: sh-development.<Zone>, menu.sh-development.<Zone>

	// login page (static/index.html is rendered as a template with these)
	LoginButton string
	LoginHello  template.HTML // trusted markup: may hold <code>

	// seeded by seedDemoContent on first login, top to bottom in list order
	DemoGroup   string
	DemoScripts []demoScript
}

type demoScript struct {
	name    string
	content string
	private bool
}

var regions = map[string]*regionTexts{
	"ru":  &regionRU,
	"com": &regionCOM,
}

// texts is the active region, set once by initRegion before anything serves.
var texts *regionTexts

// initRegion picks the texts by REGION (ru | com, set by the deploy matrix).
// Empty means local dev and falls back to ru; anything else is a config error
// and stops the process rather than serving the wrong zone.
func initRegion() {
	name := os.Getenv("REGION")
	if name == "" {
		name = "ru"
	}
	t, ok := regions[name]
	if !ok {
		log.Fatalf("unknown REGION %q (want ru or com)", name)
	}
	texts = t
	log.Printf("region: %s", name)
}
