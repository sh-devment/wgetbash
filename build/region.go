package main

import (
	"fmt"
	"html/template"
	"log"
	"os"
	"reflect"
)

// regionDef is everything that differs between the ru and com deployments
// apart from env config: the zone's domain, the language of every user-facing
// string and the demo content a new user is seeded with. The values live in
// region-ru.go and region-com.go. Technical text (logs, JSON error bodies, the
// bash safety header served by public.go) is English in both zones.
type regionDef struct {
	Domain string // sh-development.<zone>: the login page link and the menu redirect
	Lang   string // <html lang>

	Text pageText

	// seeded by seedDemoContent on first login, top to bottom in list order
	DemoGroup   string
	DemoScripts []demoScript
}

// pageText holds the strings of static/index.html. Fields, not a map: a typo
// in the template fails at startup instead of silently printing nothing.
type pageText struct {
	// login screen
	Login string
	About template.HTML // trusted markup: may hold <code>

	// header
	TabScripts string
	TabLoger   string
	Menu       string // tooltip of the profile button
	Apps       string
	Readme     string
	Logout     string

	// script manager
	Search      string // sidebar placeholder
	Back        string // tooltips
	GroupMenu   string
	EditName    string
	DeleteGroup string
	Delete      string
	Confirm     string // the delete confirmation modal

	// loger
	LoadNew          string
	Clear            string
	Select           string
	NewWindow        string
	LinesZero        string // the line counter before anything is loaded
	DropTitle        string
	DropHint         string
	PasteLabel       string
	PastePlaceholder string
	Load             string
	Focus            string
	FocusHint        string
	Center           string
	Before           string
	After            string
	Reset            string
	Remove           string
	RemoveHint       string
	Grep             string
	GrepHint         string
	Math             string
	MathHint         string
	Add              string

	JS jsText // strings set by script.js
}

// jsText is rendered into the page as JSON (window.TEXT) and read by script.js.
type jsText struct {
	// script manager
	LoadGroupsFailed    string `json:"loadGroupsFailed"`
	LoadScriptsFailed   string `json:"loadScriptsFailed"`
	AddChapter          string `json:"addChapter"`
	Expand              string `json:"expand"`
	Collapse            string `json:"collapse"`
	Unnamed             string `json:"unnamed"`
	PrivateLock         string `json:"privateLock"` // tooltip of the lock icon
	CopyScript          string `json:"copyScript"`
	Save                string `json:"save"`
	Edit                string `json:"edit"`
	CopyWget            string `json:"copyWget"`
	Make                string `json:"make"` // "make: public | private"
	Public              string `json:"public"`
	Private             string `json:"private"`
	NowPrivateHint      string `json:"nowPrivateHint"` // tooltip of the visibility button
	NowPublicHint       string `json:"nowPublicHint"`
	DeleteScript        string `json:"deleteScript"`
	AddScript           string `json:"addScript"`
	SaveFailed          string `json:"saveFailed"`
	DeleteFailed        string `json:"deleteFailed"`
	MadePrivate         string `json:"madePrivate"`
	MadePublic          string `json:"madePublic"`
	VisibilityFailed    string `json:"visibilityFailed"`
	ScriptCopied        string `json:"scriptCopied"`
	WgetCopied          string `json:"wgetCopied"`
	WgetCopiedPrivate   string `json:"wgetCopiedPrivate"`
	ChapterName         string `json:"chapterName"`
	CreateChapterFailed string `json:"createChapterFailed"`
	CreateScriptFailed  string `json:"createScriptFailed"`
	NewName             string `json:"newName"`
	EditName            string `json:"editName"`
	RenameFailed        string `json:"renameFailed"`
	DeleteChapterFailed string `json:"deleteChapterFailed"`

	// loger
	On                string `json:"on"`
	Off               string `json:"off"`
	NoMatch           string `json:"noMatch"`
	Lines             string `json:"lines"` // %d shown, %d total
	GrepPlaceholder   string `json:"grepPlaceholder"`
	RemovePlaceholder string `json:"removePlaceholder"`
	Enable            string `json:"enable"`
	Disable           string `json:"disable"`
	Delete            string `json:"delete"`
	PrefixHint        string `json:"prefixHint"`
	Unsupported       string `json:"unsupported"` // %s = the file extension
	NoExt             string `json:"noExt"`
}

type demoScript struct {
	name    string
	content string
	private bool
}

var regions = map[string]*regionDef{
	"ru":  &regionRU,
	"com": &regionCOM,
}

// Active region, set once by initRegion before anything serves.
var (
	regionName string
	region     *regionDef
)

// initRegion picks the region by REGION (ru | com, set by the deploy matrix).
// Empty means local dev and falls back to ru; anything else is a config error
// and stops the process rather than serving the wrong zone. A string forgotten
// in either region is fatal too, whichever region this instance serves.
func initRegion() {
	for name, r := range regions {
		if err := checkFilled(reflect.ValueOf(*r), "region"); err != nil {
			log.Fatalf("region %s: %v", name, err)
		}
	}

	regionName = os.Getenv("REGION")
	if regionName == "" {
		regionName = "ru"
	}
	r, ok := regions[regionName]
	if !ok {
		log.Fatalf("unknown REGION %q (want ru or com)", regionName)
	}
	region = r
	log.Printf("region name=%s domain=%s lang=%s", regionName, region.Domain, region.Lang)
}

// checkFilled walks structs and slices and fails on the first empty string.
func checkFilled(v reflect.Value, path string) error {
	switch v.Kind() {
	case reflect.String:
		if v.Len() == 0 {
			return fmt.Errorf("%s is empty", path)
		}
	case reflect.Struct:
		for i := 0; i < v.NumField(); i++ {
			if err := checkFilled(v.Field(i), path+"."+v.Type().Field(i).Name); err != nil {
				return err
			}
		}
	case reflect.Slice:
		for i := 0; i < v.Len(); i++ {
			if err := checkFilled(v.Index(i), fmt.Sprintf("%s[%d]", path, i)); err != nil {
				return err
			}
		}
	}
	return nil
}
