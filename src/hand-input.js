// A winning tile exists only after the concealed hand is fully entered.
// Each meld occupies three of the fourteen effective tile positions.
export function syncWinningTile(state) {
  const expected = 14 - state.melds.length * 3;
  if (state.hand.length !== expected) {
    state.winIndex = -1;
    return;
  }
  if (!Number.isInteger(state.winIndex) || state.winIndex < 0 || state.winIndex >= state.hand.length) {
    state.winIndex = state.hand.length - 1;
  }
}
