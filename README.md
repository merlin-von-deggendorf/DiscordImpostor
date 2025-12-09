# Discord Impostor Bot

Slash command `/impostor` that DMs a secret word to all selected users except one impostor (who gets told they do not know the word).

## Prerequisites
- Node.js 18+ and npm
- A Discord bot token in `.env` as `DISCORD_TOKEN`
- Optional: word list at `data/impostor_wordlist.txt` (fallback words are built in)

## Local run
```bash
npm ci
npm start
```

Invite the bot to your server, then use `/impostor` with at least 3 users.

## Install as a service (Debian)
```bash
bash scripts/install_service.sh
```
- Requires Node.js/npm to already be installed and `npm ci` run once in the repo.
- Uses the repo's `.env` by default; override with `ENV_FILE=/path/to/env` if you prefer.
- Override `APP_DIR=/path/to/repo` to point the service at a different checkout.

### Upload .env from Windows (scp)

scp ./.env pink-mole:~/DiscordImpostor/.env



### Service control
```bash
systemctl enable discord-impostor.service 
systemctl start discord-impostor.service   # start
systemctl stop discord-impostor.service    # stop
systemctl restart discord-impostor.service # restart
systemctl status discord-impostor.service  # status
journalctl -u discord-impostor.service -f  # logs
```

### Update + restart service
```bash
bash scripts/update_service.sh
```
- Enables the service (if not already), does a simple `git pull` in the repo, and restarts it.
- Override `REPO_DIR` if you need to run it from a different checkout.
