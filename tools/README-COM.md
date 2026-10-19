[[ <- Back ]](/README.md)

## wgetbash

Bash script delivery over wget.

I often land on servers outside my own infrastructure — they're not in
Ansible, yet the same operations keep coming up. I wanted to deliver scripts
with a single wget command. I also had a separate app, loger, for log
analysis — I merged the two into one, which makes everyday work easier.

## What's inside

- **Scripts over HTTPS** — store bash scripts and run them from a link
- **Just wget** — nothing else to install on the server
- **Notes** — a bit of Markdown support and private scripts: handy for quick notes
- **Offline mode** — where wget can't reach, copy the script via the clipboard
- **Search** — quick and handy, across all content
- **Logs** — everything you need for quick, on-the-fly log analysis
