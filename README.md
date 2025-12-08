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
- Uses `root` by default; override with `APP_USER` if desired.
- Copies `.env` to `/etc/discord-impostor.env` (edit secrets there if needed).

### Service control
```bash
sudo systemctl start discord-impostor.service   # start
sudo systemctl stop discord-impostor.service    # stop
sudo systemctl restart discord-impostor.service # restart
sudo systemctl status discord-impostor.service  # status
sudo journalctl -u discord-impostor.service -f  # logs
```
