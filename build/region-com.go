package main

var regionCOM = regionDef{
	Domain: "sh-development.com",
	Lang:   "en",

	Text: pageText{
		Login: "login",
		About: `store your bash scripts in the cloud and run them on any server with a single <code>wget</code> command — no files, no setup, just copy and go`,

		TabScripts: "wgetbash",
		TabLoger:   "loger",
		Menu:       "menu",
		Apps:       "apps",
		Readme:     "readme",
		Logout:     "log out",

		Search:      "search",
		Back:        "back",
		GroupMenu:   "group menu",
		EditName:    "edit name",
		DeleteGroup: "delete group",
		Delete:      "delete",
		Confirm:     "are you sure?",

		LoadNew:          "load new",
		Clear:            "clear",
		Select:           "select",
		NewWindow:        "new window",
		LinesZero:        "0 / 0 lines",
		DropTitle:        "Drop a log file here",
		DropHint:         "or click to browse",
		PasteLabel:       "or paste log text",
		PastePlaceholder: "Paste log lines here…",
		Load:             "load",
		Focus:            "Focus",
		FocusHint:        "center line context",
		Center:           "center",
		Before:           "before",
		After:            "after",
		Reset:            "reset",
		Remove:           "Remove",
		RemoveHint:       "hide matching",
		Grep:             "Grep",
		GrepHint:         "show only matching",
		Math:             "Math",
		MathHint:         "filter by number value",
		Add:              "+ add",

		JS: jsText{
			LoadGroupsFailed:    "failed to load groups",
			LoadScriptsFailed:   "failed to load scripts",
			AddChapter:          "add chapter",
			Expand:              "expand",
			Collapse:            "collapse",
			Unnamed:             "(unnamed)",
			PrivateLock:         "private — only you can open it",
			CopyScript:          "copy script",
			Save:                "save",
			Edit:                "edit",
			CopyWget:            "copy wget command",
			Make:                "make:",
			Public:              "public",
			Private:             "private",
			NowPrivateHint:      "now private — anyone with the link could run it again",
			NowPublicHint:       "now public — only you would be able to open it",
			DeleteScript:        "delete script",
			AddScript:           "add script",
			SaveFailed:          "failed to save script",
			DeleteFailed:        "failed to delete script",
			MadePrivate:         "private — opens only while you are logged in",
			MadePublic:          "public — anyone with the link can run it",
			VisibilityFailed:    "failed to change visibility",
			ScriptCopied:        "script copied!",
			WgetCopied:          "wget command copied!",
			WgetCopiedPrivate:   "wget copied — script is private, it will not run remotely",
			ChapterName:         "chapter name",
			CreateChapterFailed: "failed to create chapter",
			CreateScriptFailed:  "failed to create script",
			NewName:             "new name",
			EditName:            "edit name",
			RenameFailed:        "failed to rename chapter",
			DeleteChapterFailed: "failed to delete chapter",

			On:                "on",
			Off:               "off",
			NoMatch:           "No lines match current conditions.",
			Lines:             "%d / %d lines",
			GrepPlaceholder:   "*text* or ERROR",
			RemovePlaceholder: "*200* or ERROR",
			Enable:            "enable",
			Disable:           "disable",
			Delete:            "delete",
			PrefixHint:        "optional prefix before number",
			Unsupported:       "Unsupported: %s",
			NoExt:             "(no ext)",
		},
	},

	DemoGroup: "get started",
	DemoScripts: []demoScript{
		{
			"hello world",
			`# hi! this is an example script
# no need to write #!/bin/bash — it is added automatically
# write commands, save, then press [wget] — the link is copied to your clipboard
# paste it on any server and the script runs remotely

# the script runs in memory through a pipe — nothing is saved on the server
# no files are created, nothing to clean up afterwards

# current date and time
date

# system name and kernel version
uname -a

# current user
whoami

# memory: total / used / free
free -h

# disk space on the root partition
df -h /

# how long the system has been up since the last reboot
uptime`,
			false,
		},
		{
			"error handling",
			`# this script shows what happens on an error
# wgetbash wraps every script in error handling
# if any command exits with a non-zero code:
#   - execution stops right away
#   - the number of the failed line is shown
#   - a red [ERROR] with the exit code is printed

# this one succeeds
echo "step 1: ok"

# and this one fails — exit code 1
# nothing below this line will run
false

# we never get here
echo "step 2: you will not see this"`,
			false,
		},
		{
			"markdown and private notes",
			`# this is a note, not a command for a server
# it is already private — see the lock to the left of the name

# ── privacy ──
# the [make: private] button at the bottom toggles visibility
# anyone with the link can run a public script
# a private one is served only to you, in a browser where you are logged in
# a private script will not run via wget — you get a 401 instead of the code
# handy when it is a note rather than a command for a server

# ── markdown ──
# three dashes on a line of their own draw a horizontal rule:

---

# and a link like [text](https://example.com) becomes clickable:
# source code — [wgetbash on github](https://github.com/sh-devment/wgetbash)

# ── important ──
# markdown works only here, in view mode
# in edit mode and in the wget output the text stays raw, character for character
# so rendering has no effect on what actually runs on the server`,
			true,
		},
	},
}
