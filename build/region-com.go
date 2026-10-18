package main

var regionCOM = regionTexts{
	Lang: "en",
	Zone: "com",

	LoginButton: "login",
	LoginHello:  `store your bash scripts in the cloud and run them on any server with a single <code>wget</code> command — no files, no setup, just copy and go`,

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
