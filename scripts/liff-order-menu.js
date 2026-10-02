function buildOrderMenu(existing, liffId) {
  if (!/^[0-9]+-[a-zA-Z0-9]+$/.test(liffId)) throw Error('Invalid LIFF ID');
  if (!Array.isArray(existing.areas) || existing.areas.length !== 6) throw Error('Expected the project six-button menu');
  const areas = structuredClone(existing.areas);
  for (const index of [0, 1]) {
    const action = areas[index].action;
    if (action.type !== 'uri' || !/^https:\/\/(promote-glon-3\.vercel\.app|liff\.line\.me)\//.test(action.uri)) throw Error('Unexpected order menu link; preserving the current menu');
  }
  areas[0].action = { type: 'uri', uri: `https://liff.line.me/${liffId}` };
  areas[1].action = { type: 'uri', uri: `https://liff.line.me/${liffId}?mode=6pack` };
  return { size: existing.size, selected: existing.selected, name: 'N3_Thanakit_MainMenu_v8_LIFF', chatBarText: existing.chatBarText, areas };
}
module.exports = { buildOrderMenu };
