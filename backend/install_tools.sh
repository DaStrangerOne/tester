#!/usr/bin/env bash
# Idempotent install of red-team CLI tools needed by AXIOM runtime.
# Runs at every backend startup because the container's /usr is ephemeral.
# Installs each package independently so one failure doesn't block the rest.
set +e
export DEBIAN_FRONTEND=noninteractive

LOG=/tmp/tools-install.log
: > "$LOG"

log() { echo "[install-tools] $*" | tee -a "$LOG"; }

# Run apt-get update once (best-effort)
log "apt-get update..."
apt-get update -qq >>"$LOG" 2>&1

# Individual install — keep going on failure
PKGS=(
  nmap whatweb sqlmap masscan
  netcat-openbsd ncat dnsutils whois traceroute
  hydra john hashcat
  golang-go
  jq curl wget openssl ruby perl
  libimage-exiftool-perl
  dirb wfuzz
  sudo
  wordlists
  # Service / protocol clients commonly used in red-team workflows
  smbclient enum4linux ldap-utils snmp snmp-mibs-downloader
  ftp telnet openssh-client
  # Utilities the AI tends to assume are present
  unzip zip tree file binutils xxd
  # Python tooling needed by some recon scripts
  python3-pip python3-requests python3-bs4 python3-dnspython
  # Perl modules needed by nikto
  libjson-perl libxml-writer-perl libnet-ssleay-perl libwhisker2-perl
)
for pkg in "${PKGS[@]}"; do
  if dpkg -s "$pkg" >/dev/null 2>&1; then
    continue
  fi
  log "installing $pkg..."
  apt-get install -y -qq --no-install-recommends "$pkg" >>"$LOG" 2>&1 || log "  WARN: $pkg failed"
done

# Nikto isn't in Debian; clone from GitHub
if ! command -v nikto >/dev/null 2>&1; then
  if [ ! -d /opt/nikto ]; then
    log "cloning nikto..."
    git clone --depth 1 https://github.com/sullo/nikto.git /opt/nikto >>"$LOG" 2>&1 || log "  WARN: nikto clone failed"
  fi
  if [ -f /opt/nikto/program/nikto.pl ]; then
    chmod +x /opt/nikto/program/nikto.pl
    ln -sf /opt/nikto/program/nikto.pl /usr/local/bin/nikto
  fi
fi

# gobuster (sometimes already installed via apt; double-check)
if ! command -v gobuster >/dev/null 2>&1; then
  apt-get install -y -qq gobuster >>"$LOG" 2>&1 || log "  WARN: gobuster failed"
fi

# ─── Wordlists ────────────────────────────────────────────────────────────
# Debian's `dirb` package installs wordlists at /usr/share/dirb/wordlists/,
# but tools/agents commonly reference /usr/share/wordlists/dirb/common.txt.
# Create the canonical layout via symlinks so every tool finds its files.
mkdir -p /usr/share/wordlists
if [ -d /usr/share/dirb/wordlists ] && [ ! -e /usr/share/wordlists/dirb ]; then
  ln -sf /usr/share/dirb/wordlists /usr/share/wordlists/dirb
  log "linked /usr/share/wordlists/dirb -> /usr/share/dirb/wordlists"
fi
if [ -d /usr/share/wfuzz/wordlist ] && [ ! -e /usr/share/wordlists/wfuzz ]; then
  ln -sf /usr/share/wfuzz/wordlist /usr/share/wordlists/wfuzz
fi
# rockyou wordlist — extract from SecLists tarball if available (after clone below)
# Common username + password files for hydra/medusa
if [ ! -f /usr/share/wordlists/users.txt ]; then
  printf 'root\nadmin\nuser\ntest\nguest\nubuntu\noracle\npostgres\nmysql\nftp\nwww-data\noperator\n' \
    > /usr/share/wordlists/users.txt
fi
if [ ! -f /usr/share/wordlists/passwords.txt ]; then
  printf 'password\nadmin\n123456\npassword123\nletmein\nwelcome\nroot\nchangeme\ntoor\nqwerty\n12345678\nadmin123\n' \
    > /usr/share/wordlists/passwords.txt
fi
# SecLists (the de-facto wordlist collection) — clone shallow, only if absent.
# Validate completeness too: if a previous clone was interrupted the dir may
# exist but be missing the Passwords/ subtree, in which case we re-clone.
if [ ! -d /opt/SecLists/Passwords/Leaked-Databases ]; then
  log "(re)cloning SecLists (shallow)..."
  rm -rf /opt/SecLists
  git clone --depth 1 https://github.com/danielmiessler/SecLists.git /opt/SecLists >>"$LOG" 2>&1 || log "  WARN: SecLists clone failed"
fi
if [ -d /opt/SecLists ] && [ ! -e /usr/share/wordlists/seclists ]; then
  ln -sf /opt/SecLists /usr/share/wordlists/seclists
fi
# rockyou wordlist — extract from SecLists tarball
if [ ! -f /usr/share/wordlists/rockyou.txt ]; then
  if [ -f /opt/SecLists/Passwords/Leaked-Databases/rockyou.txt.tar.gz ]; then
    tar xzf /opt/SecLists/Passwords/Leaked-Databases/rockyou.txt.tar.gz \
      -C /usr/share/wordlists/ 2>/dev/null && log "extracted rockyou.txt from SecLists"
  fi
fi
# Metasploit-style wordlist directory referenced by some hydra examples
mkdir -p /usr/share/wordlists/metasploit
if [ ! -f /usr/share/wordlists/metasploit/unix_users.txt ] && [ -f /opt/SecLists/Usernames/top-usernames-shortlist.txt ]; then
  ln -sf /opt/SecLists/Usernames/top-usernames-shortlist.txt /usr/share/wordlists/metasploit/unix_users.txt
fi
if [ ! -f /usr/share/wordlists/metasploit/unix_passwords.txt ] && [ -f /opt/SecLists/Passwords/Common-Credentials/10-million-password-list-top-1000.txt ]; then
  ln -sf /opt/SecLists/Passwords/Common-Credentials/10-million-password-list-top-1000.txt /usr/share/wordlists/metasploit/unix_passwords.txt
fi

# ─── sudo ─────────────────────────────────────────────────────────────────
# Container already runs as root, so sudo should be a no-op. Make sure the
# binary is installed and runs without prompting.
if ! command -v sudo >/dev/null 2>&1; then
  apt-get install -y -qq sudo >>"$LOG" 2>&1 || log "  WARN: sudo apt failed"
fi
if ! command -v sudo >/dev/null 2>&1; then
  # Last resort: drop a wrapper that just execs whatever's passed
  cat > /usr/local/bin/sudo <<'WRAP'
#!/bin/bash
# AXIOM fallback sudo — container runs as root, so just execute args.
args=()
while [ $# -gt 0 ]; do
  case "$1" in
    -u|--user|-g|--group|-h|--host|-p|--prompt) shift 2 ;;
    -H|-n|-S|-k|-K|-l|-v|-i|-s|-A) shift ;;
    --) shift; break ;;
    -*) shift ;;
    *) break ;;
  esac
done
exec "$@"
WRAP
  chmod +x /usr/local/bin/sudo
  log "installed fallback sudo wrapper at /usr/local/bin/sudo"
fi
# Belt-and-suspenders: make sure sudoers lets root run anything without prompt.
if [ -d /etc/sudoers.d ]; then
  echo "root ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/00-axiom-root 2>/dev/null
  chmod 0440 /etc/sudoers.d/00-axiom-root 2>/dev/null
fi

log "post-install verification:"
for t in nmap nikto whatweb sqlmap masscan hydra john hashcat dig whois nc traceroute jq go gobuster curl wget openssl dirb wfuzz sudo; do
  p=$(command -v "$t" 2>/dev/null || echo MISSING)
  log "  $t -> $p"
done
log "wordlists:"
for f in /usr/share/wordlists/dirb/common.txt /usr/share/wordlists/users.txt /usr/share/wordlists/passwords.txt /usr/share/wordlists/rockyou.txt /usr/share/wordlists/seclists/Discovery/Web-Content/common.txt; do
  if [ -e "$f" ]; then log "  OK  $f"; else log "  MISS $f"; fi
done

# ─── Install transparent nmap wrapper that auto-injects --unprivileged ───
if [ -x /usr/bin/nmap ]; then
  cat > /usr/local/bin/nmap <<'WRAP'
#!/bin/bash
# AXIOM nmap wrapper — forces --unprivileged when the container blocks raw sockets.
for arg in "$@"; do
  case "$arg" in
    --unprivileged|--privileged|-sT|-sn|--help|-h|-V|--version)
      exec /usr/bin/nmap "$@"
      ;;
  esac
done
exec /usr/bin/nmap --unprivileged "$@"
WRAP
  chmod +x /usr/local/bin/nmap
  log "  installed /usr/local/bin/nmap wrapper (--unprivileged auto-inject)"
fi

# ─── Anti-hang wrappers for tools that prompt interactively ──────────────
# sqlmap defaults to asking the user "do you want to..."; --batch picks defaults.
if [ -x /usr/bin/sqlmap ]; then
  cat > /usr/local/bin/sqlmap <<'WRAP'
#!/bin/bash
# AXIOM sqlmap wrapper — injects --batch so the tool never blocks on prompts.
for arg in "$@"; do
  case "$arg" in
    --batch|--wizard|--update|--help|-h|-hh|--version) exec /usr/bin/sqlmap "$@" ;;
  esac
done
exec /usr/bin/sqlmap --batch "$@"
WRAP
  chmod +x /usr/local/bin/sqlmap
fi

# ssh / scp / sftp — never prompt, never block on host-key verification
for bin in ssh scp sftp; do
  real="/usr/bin/$bin"
  [ -x "$real" ] || continue
  cat > "/usr/local/bin/$bin" <<WRAP
#!/bin/bash
# AXIOM $bin wrapper — non-interactive, auto-accept host keys.
exec $real \\
  -o BatchMode=yes \\
  -o StrictHostKeyChecking=accept-new \\
  -o UserKnownHostsFile=/tmp/axiom_known_hosts \\
  -o ConnectTimeout=10 \\
  -o ServerAliveInterval=15 \\
  -o ServerAliveCountMax=2 \\
  "\$@"
WRAP
  chmod +x "/usr/local/bin/$bin"
done

# ftp — refuse to read .netrc and use passive mode by default
if [ -x /usr/bin/ftp ]; then
  cat > /usr/local/bin/ftp <<'WRAP'
#!/bin/bash
# AXIOM ftp wrapper — non-interactive (-n), passive mode (-p), 20s connect.
exec /usr/bin/ftp -n -p -v "$@"
WRAP
  chmod +x /usr/local/bin/ftp
fi

exit 0
