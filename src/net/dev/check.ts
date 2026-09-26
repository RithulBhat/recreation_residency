/**
 * Dev-only PeerJS smoke harness (not reachable from the app, not in the production build).
 *
 *   npm run dev
 *   open http://localhost:5173/src/net/dev/check.html?role=host&code=ABCDEF   (tab 1)
 *   open http://localhost:5173/src/net/dev/check.html?role=guest&code=ABCDEF  (tab 2)
 *
 * Both tabs should reach status "connected", show the opponent's name, echo an emote and report a
 * latency once the first heartbeat lands. Used by scripts/… style throwaway Playwright checks to
 * confirm the real 0.peerjs.com signalling path works from a machine/network.
 */

import type { PlayerConfig } from '@/types';
import { createDuelSession } from '../duel';
import { normalizeRoomCode } from '../protocol';

const params = new URLSearchParams(location.search);
const role = params.get('role') === 'guest' ? 'guest' : 'host';
const code = normalizeRoomCode(params.get('code') ?? '') ?? undefined;

const el = (id: string): HTMLElement => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node;
};

const lines: string[] = [];
function log(line: string): void {
  lines.push(`${new Date().toISOString().slice(11, 23)} ${line}`);
  el('log').textContent = lines.join('\n');
}

const me: PlayerConfig =
  role === 'host'
    ? { id: 'you', name: 'HostBot', emoji: '🎵', color: '#a855f7' }
    : { id: 'you', name: 'GuestBot', emoji: '🦊', color: '#f97316' };

const session = createDuelSession({ role, code, me });

el('role').textContent = role;
el('code').textContent = session.code;
document.body.dataset.role = role;

session.on('status', (status) => {
  el('status').textContent = status;
  el('code').textContent = session.code;
  document.body.dataset.status = status;
  log(`status → ${status}`);
  if (status === 'connected') session.send({ type: 'emote', emoji: role === 'host' ? '🔥' : '🎉' });
});

session.on('opponent', (opponent) => {
  el('opponent').textContent = opponent ? `${opponent.emoji} ${opponent.name}` : '-';
  log(`opponent → ${opponent ? opponent.name : 'none'}`);
});

session.on('latency', (ms) => {
  el('latency').textContent = `${ms}ms`;
  document.body.dataset.latency = String(ms);
});

session.on('error', (message) => {
  log(`error → ${message}`);
  document.body.dataset.error = message;
});

session.on('message', (msg) => {
  log(`recv ${msg.type}`);
  if (msg.type === 'emote') {
    el('echo').textContent = msg.emoji;
    document.body.dataset.echo = msg.emoji;
  }
});

window.addEventListener('beforeunload', () => session.close('tab closed'));
log(`booting as ${role} on ${session.code}`);
