// Token Radar's dashboard (radar-2). It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail drawer with
// the model's own inputs and the protocol's farm plan, and a model sandbox that recomputes
// every row from the same function with the reader's own constants. No network: every byte it
// shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchlistOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var sandbox = { growthWeight: DATA.model.growth_weight, maturityRange: DATA.model.maturity_range, chainOn: true, benchOn: true };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks
  // the number board.json carries, so the page's code and the board's data are visibly the same
  // arithmetic. The sandbox calls this with the reader's own constants.
  function impliedOf(row, opts) {
    var m = DATA.model;
    var base = opts.benchOn ? row.category_multiple : DATA.global_multiple;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * opts.growthWeight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * opts.maturityRange;
    var chainMult = 1;
    if (opts.chainOn) {
      var extra = Math.min(Math.max((row.chains || []).length - 1, 0), m.chain_cap);
      chainMult = 1 + m.chain_step * extra;
    }
    return Math.max(1, Math.round(row.tvl_usd * base * growthMult * maturity * chainMult));
  }
  function sandboxActive() {
    var m = DATA.model;
    return sandbox.growthWeight !== m.growth_weight || sandbox.maturityRange !== m.maturity_range || !sandbox.chainOn || !sandbox.benchOn;
  }
  function viewValue(row) {
    return sandboxActive() ? impliedOf(row, sandbox) : row.implied_value_usd;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and
  // age decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('farm') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s farm on " + chain + ' and compound the rewards weekly.';
    if (c.indexOf('launchpad') >= 0) return 'Stake $' + capital + " of the launchpad's qualifying asset on " + name + ' and join one allocation round.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function watchFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('rwa') >= 0) return 'Watch for a governance or points announcement: vault managers usually signal a token before they launch one.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Watch the borrow rates and any points or rewards tab: lending airdrops usually weight time supplied over size.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0) return 'Watch pool volume and any volume-based points: DEX airdrops usually weight fees and swaps over idle liquidity.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Watch open interest and funding: perp airdrops usually weight trading volume over margin held.';
    if (c.indexOf('stable') >= 0) return 'Watch the peg and the mint cap: stablecoin airdrops usually weight minted supply held over time.';
    return "Watch the protocol's announcements and TVL: a sudden points program or a governance vote is the usual first sign of a launch.";
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: watchFor(p), cost: 'nothing to watch, only the habit of checking', time: '5 minutes a week' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watchlist') === '1') state.watchlistOnly = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.watchlistOnly && !isWatchlist(r.slug)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function isWatchlist(slug) {
    return DATA.watchlist_slugs && DATA.watchlist_slugs.indexOf(slug) >= 0;
  }
  function sortedRows(list) {
    var key = state.sort;
    var withValue = list.map(function (r) { return { r: r, v: viewValue(r) }; });
    withValue.sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.r.name.toLowerCase(); bv = b.r.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.r.tvl_usd; bv = b.r.tvl_usd; }
      else if (key === 'growth') { av = a.r.change_7d === null ? -Infinity : a.r.change_7d; bv = b.r.change_7d === null ? -Infinity : b.r.change_7d; }
      else if (key === 'age') { av = a.r.age_days === null ? Infinity : a.r.age_days; bv = b.r.age_days === null ? Infinity : b.r.age_days; }
      else { av = a.v; bv = b.v; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.r.slug < b.r.slug ? -1 : a.r.slug > b.r.slug ? 1 : 0;
    });
    return withValue;
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'top-inner' },
        el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
        el('div', { class: 'top-meta' },
          el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
          el('span', { text: 'DefiLlama protocol index' }),
          el('span', null, 'Model ', el('b', { text: DATA.model_version }))
        )
      )
    );
  }

  function lede() {
    var total = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var sorted = DATA.rows.map(function (r) { return r.implied_value_usd; }).sort(function (a, b) { return a - b; });
    var median = sorted[Math.floor(sorted.length / 2)] || 0;
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { class: 'gold', text: fmtUsd(total) })),
        el('div', { class: 'fact' }, el('span', { text: 'Median implied value' }), el('b', { text: fmtUsd(median) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var wl = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.watchlistOnly ? 'checked' : null }),
      'Watchlist only'
    );
    wl.querySelector('input').addEventListener('change', function (e) { state.watchlistOnly = e.target.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      wl,
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? filteredRows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    var active = sandboxActive();
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; writeHash(); render(); } })
      ));
    }
    var max = list[0].v || 1;
    var tbody = el('tbody');
    list.forEach(function (item, i) {
      var r = item.r;
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var rankLabel = active ? String(i + 1) : String(r.rank);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        class: (!active && r.rank <= 3) || (active && i < 3) ? 'top-row' : null,
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: rankLabel }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((item.v / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(item.v) }),
          active ? el('span', { class: 'sandbox-badge', text: 'sandbox' }) : null
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' + (active ? ' Sandbox values shown: the board is re-ranked with your constants.' : '') }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var topBench = DATA.benchmarks.slice(0, 8);
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + 0.02 x min(chains - 1, 10)) )'
      ),
      el('p', { class: 'sub', text: 'The category multiple is the market’s own pricing: the median market-cap-to-TVL ratio of the live-token protocols in the same category, read from this very snapshot and shrunk toward the global median of ' + DATA.global_multiple + ' where a category has few live comparables. TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Chain breadth adds up to 20% for protocols that run on many chains.' }),
      el('div', { class: 'bench' }, topBench.map(function (b) {
        return el('div', null, el('span', { text: b.category + ' (' + b.comps + ' live)' }), el('b', { text: 'x' + b.multiple.toFixed(3) }));
      }))
    );
  }

  function sandboxPanel() {
    var m = DATA.model;
    function slider(id, label, min, max, step, value, oninput) {
      var out = el('output', { for: id, text: String(value) });
      var input = el('input', { type: 'range', id: id, min: String(min), max: String(max), step: String(step), value: String(value) });
      input.addEventListener('input', function () { out.textContent = input.value; oninput(parseFloat(input.value)); });
      return el('div', { class: 'field' }, el('label', { for: id, text: label }), input, out);
    }
    function toggle(id, label, checked, oninput) {
      var input = el('input', { type: 'checkbox', id: id, checked: checked ? 'checked' : null });
      input.addEventListener('change', function () { oninput(input.checked); });
      return el('label', { class: 'check' }, input, label);
    }
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset to the board model', onclick: function () {
      sandbox.growthWeight = m.growth_weight; sandbox.maturityRange = m.maturity_range; sandbox.chainOn = true; sandbox.benchOn = true; render();
    } });
    return el('section', { class: 'panel sandbox' },
      el('h2', { text: 'Model sandbox: re-rank the board with your own constants' }),
      el('p', { class: 'sub', text: 'The same function scores every row. Move a slider and the board re-ranks live; the board’s own numbers are the model’s defaults, and the sandbox never changes board.json.' }),
      el('div', { class: 'sandbox-grid' },
        slider('sb-growth', 'Growth weight', 0, 1, 0.05, sandbox.growthWeight, function (v) { sandbox.growthWeight = v; render(); }),
        slider('sb-maturity', 'Maturity range', 0, 0.6, 0.05, sandbox.maturityRange, function (v) { sandbox.maturityRange = v; render(); }),
        toggle('sb-chain', 'Chain breadth (+2% a chain, to +20%)', sandbox.chainOn, function (v) { sandbox.chainOn = v; render(); }),
        toggle('sb-bench', 'Category benchmark (off: flat global multiple)', sandbox.benchOn, function (v) { sandbox.benchOn = v; render(); })
      ),
      el('div', { class: 'row' }, reset, sandboxActive() ? el('span', { class: 'sandbox-badge', text: 'sandbox active' }) : el('span', { class: 'sub', text: 'Showing the board model.' }))
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function signalBar(label, value, max, text) {
    return el('div', { class: 'signal' },
      el('span', { text: label }),
      el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((value / max) * 100)) + '%' })),
      el('b', { class: 'num', text: text })
    );
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var boardValue = impliedOf(row, { growthWeight: DATA.model.growth_weight, maturityRange: DATA.model.maturity_range, chainOn: true, benchOn: true });
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: 'x' + row.category_multiple.toFixed(4) + ' (' + row.benchmark_comps + ' live comps)' })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: row.growth_multiplier.toFixed(4) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: row.maturity_multiplier.toFixed(4) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String((row.chains || []).length) + ' (x' + row.chain_multiplier.toFixed(4) + ')' })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(boardValue) + (boardValue === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Signals' }),
      signalBar('Category multiple', row.category_multiple, 1, 'x' + row.category_multiple.toFixed(4)),
      signalBar('Growth multiplier', row.growth_multiplier, 1.6, 'x' + row.growth_multiplier.toFixed(4)),
      signalBar('Maturity multiplier', row.maturity_multiplier, 1, 'x' + row.maturity_multiplier.toFixed(4)),
      signalBar('Chain multiplier', row.chain_multiplier, 1.2, 'x' + row.chain_multiplier.toFixed(4))
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    // Keep the control the reader is using: record its id and caret, rebuild, then put it back.
    var active = document.activeElement;
    var activeId = active && active.id ? active.id : null;
    var selStart = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
    var selEnd = active && typeof active.selectionEnd === 'number' ? active.selectionEnd : null;
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') {
      shell.appendChild(modelPanel());
      shell.appendChild(sandboxPanel());
    }
    shell.appendChild(el('p', { class: 'note', text: 'A protocol on this board records no token in the snapshot; that is DefiLlama’s record, not proof it has none. Implied value is the radar’s own estimate from the snapshot’s figures, never a price and never a prediction that a token is issued. Farm at your own risk, with money you can afford to lose.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
    if (activeId) {
      var back = document.getElementById(activeId);
      if (back) {
        back.focus();
        if (selStart !== null && typeof back.setSelectionRange === 'function') {
          try { back.setSelectionRange(selStart, selEnd); } catch (e) { /* range inputs take no caret */ }
        }
      }
    }
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
