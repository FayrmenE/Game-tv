/* «Сундуки»: подписи и рисунок сундука — общие для ТВ и телефона */
(function () {
  'use strict';
  var t = function (k, v) { return U.t(k, v); };
  function cardEmoji(k) {
    if (k === 'thief') return '🦹';
    if (k === 'mimic') return '👹';
    if (k === '0') return '🕸️';
    return k.charAt(0) === '+' ? '💰' : '💸';
  }
  function cardLabel(k) {
    if (k === 'thief') return t('chests.card.thief');
    if (k === 'mimic') return t('chests.card.mimic');
    if (k === '0') return t('chests.card.empty');
    return k.replace('-', '−');
  }
  function cardTone(k) { return k === '0' ? 'empty' : k === 'thief' || k === 'mimic' ? 'trap' : k.charAt(0) === '+' ? 'good' : 'bad'; }
  function chestSvg() {
    return '<svg viewBox="0 0 200 170" class="ch-svg">' +
      '<g class="ch-lid"><path d="M18 70 Q18 18 100 18 Q182 18 182 70 Z" fill="#a0522d" stroke="#2d2a3e" stroke-width="6" stroke-linejoin="round"/>' +
      '<path d="M50 70 Q50 30 100 26 Q150 30 150 70" fill="none" stroke="#ffd166" stroke-width="7"/></g>' +
      '<rect x="18" y="70" width="164" height="86" rx="8" fill="#8b4513" stroke="#2d2a3e" stroke-width="6"/>' +
      '<rect x="18" y="70" width="164" height="16" fill="#6b3410" stroke="#2d2a3e" stroke-width="5"/>' +
      '<path d="M48 70 V156 M152 70 V156" stroke="#ffd166" stroke-width="8"/>' +
      '<rect x="86" y="78" width="28" height="34" rx="5" fill="#ffd166" stroke="#2d2a3e" stroke-width="5"/>' +
      '<circle cx="100" cy="92" r="5" fill="#2d2a3e"/><rect x="98" y="94" width="4" height="10" fill="#2d2a3e"/>' +
      '</svg>';
  }
  window.CHESTS = { cardEmoji: cardEmoji, cardLabel: cardLabel, cardTone: cardTone, chestSvg: chestSvg };

})();
