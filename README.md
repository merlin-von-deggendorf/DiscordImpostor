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
sudo bash scripts/install_service.sh
```
- Requires Node.js/npm to already be installed and `npm ci` run once in the repo.
- Uses the repo's `.env` by default; override with `ENV_FILE=/path/to/env` if you prefer.
- Override `APP_DIR=/path/to/repo` to point the service at a different checkout.

### Upload .env from Windows (scp)

scp ./.env pink-mole:~/DiscordImpostor/.env



### Service control
```bash
systemctl enable discord-impostor.service 
sudo systemctl start discord-impostor.service   # start
sudo systemctl stop discord-impostor.service    # stop
sudo systemctl restart discord-impostor.service # restart
sudo systemctl status discord-impostor.service  # status
sudo journalctl -u discord-impostor.service -f  # logs
```

### Update + restart service
```bash
sudo bash scripts/update_service.sh
```
- Enables the service (if not already), pulls latest from git, and restarts it.
- Override `GIT_BRANCH`, `GIT_REMOTE`, or `REPO_DIR` if you need non-defaults.
