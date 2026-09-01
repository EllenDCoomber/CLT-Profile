(() => {
  const app = document.getElementById('app');
  const config = window.CLT_CONFIG;
  const bundled = window.CLT_QUESTIONS;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const params = new URLSearchParams(location.search);
  const token = params.get('t');
  const assessment = params.get('a') || '';
  const role = Object.keys(config.roles).find((key) => config.roles[key] === token) || null;

  if (!token) {
    document.title = bundled.title;
    app.innerHTML = '<div class="screen notice"><h1>' + esc(bundled.title) + '</h1><p>This questionnaire is only accessible through an assessment link.</p>' +
      (config.workerUrl ? '<p class="admin-link"><a href="' + esc(config.workerUrl.replace(/\/+$/, '') + '/') + '">Results portal (admin)</a></p>' : '') + '</div>';
    return;
  }
  if (!role) {
    app.innerHTML = '<div class="screen notice"><h1>' + esc(bundled.title) + '</h1><p>This questionnaire link isn’t recognised. Please use the link you were sent.</p></div>';
    return;
  }

  async function loadQuestions() {
    if (assessment && config.workerUrl) {
      try {
        const response = await fetch(config.workerUrl + '/api/questions/' + encodeURIComponent(assessment));
        if (response.ok) return response.json();
      } catch (_) { /* use bundled authority set */ }
    }
    return bundled;
  }

  loadQuestions().then(start);

  function start(q) {
    const all = [...q.personal, ...q.team];
    const bySection = new Map(q.sections.map((section) => [section.id, all.filter((item) => item.section === section.id)]));
    const key = 'clb_view_' + role + (assessment ? '_' + assessment : '');
    const load = () => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (_) { return {}; } };
    const restored = load();
    const state = {
      page: Number.isInteger(restored.page) && restored.page >= 0 && restored.page <= 4 ? restored.page : 0,
      answers: restored.answers || {}
    };
    const save = () => localStorage.setItem(key, JSON.stringify(state));
    const clear = () => localStorage.removeItem(key);
    const intro = q.intros[role];
    document.title = intro.heading + ' – ' + intro.version.replace(' VERSION', '');

    function progress() {
      const answered = Object.keys(state.answers).filter((id) => all.some((q) => q.id === id)).length;
      const count = state.page === 0 ? 'Front page' : answered + ' of 57 answered';
      return '<div class="progress"><div class="meta"><span>' + count + '</span><span>Page ' + (state.page + 1) + ' of 5</span></div>' +
        '<div class="bar"><span style="width:' + Math.round(((state.page + (state.page ? answered / 57 : 0)) / 5) * 100) + '%"></span></div></div>';
    }

    function renderFront() {
      app.innerHTML = progress() + '<div class="screen intro"><p class="pill">' + esc(intro.version) + '</p><h1>' + esc(intro.heading) + '</h1>' +
        '<div class="lead">' + intro.lead.map((p) => '<p>' + esc(p) + '</p>').join('') + '</div>' +
        '<h2>Before you begin</h2><div class="lead">' + intro.about.concat(intro.instructions).map((p) => '<p>' + esc(p) + '</p>').join('') + '</div>' +
        '<p>For each statement, choose the response that best reflects how <strong>frequently it has been true in practice</strong> over approximately the last 3 months.</p>' +
        '<ul class="legend">' + q.scales.frequency.map((label) => '<li>' + esc(label) + '</li>').join('') + '</ul>' +
        '<nav><button class="primary" data-action="next">Begin</button></nav><button class="ghost" data-action="restart">Start over — clear my answers</button></div>';
    }

    function scaleFor(section) { return q.scales[section.scale]; }
    function question(item, scale) {
      const options = scale.map((label, i) => {
        const checked = state.answers[item.id]?.value === i + 1 ? ' checked' : '';
        return '<label><input type="radio" name="q_' + esc(item.id) + '" value="' + (i + 1) + '"' + checked + '><span>' + esc(label) + '</span></label>';
      }).join('');
      return '<div class="q" data-qid="' + esc(item.id) + '"><div class="statement">' + esc(item.text) + '</div><fieldset class="scale" data-count="' + scale.length + '">' + options + '</fieldset></div>';
    }

    function pageComplete(section) {
      return bySection.get(section.id).every((item) => state.answers[item.id]?.value != null);
    }

    function renderSection() {
      const section = q.sections[state.page - 1];
      const scale = scaleFor(section);
      const items = bySection.get(section.id);
      app.innerHTML = progress() + '<div class="screen"><p class="pill">Section ' + section.id + '</p><h1>' + esc(section.title) + '</h1>' +
        '<p class="subtitle">' + esc(section.instructions) + '</p>' + (section.prefix ? '<h2>' + esc(section.prefix) + '</h2>' : '') +
        items.map((item) => question(item, scale)).join('') +
        '<p id="answerError" class="error" hidden>Please answer every statement before continuing.</p><nav><button data-action="back">Back</button>' +
        '<button class="primary" data-action="next"' + (pageComplete(section) ? '' : ' disabled') + '>' + (state.page === 4 ? 'Submit' : 'Continue') + '</button></nav></div>';
    }

    function renderThanks(saved) {
      app.innerHTML = '<div class="screen"><h1>Thank you</h1><p class="subtitle">Your responses have been recorded.</p>' +
        (saved ? '' : '<p class="error">The questionnaire could not connect to the collection service. Your answers remain saved in this browser; please try again.</p>') + '</div>';
    }

    async function submit() {
      const payload = { role, assessment, submittedAt: new Date().toISOString(),
        answers: all.map((item) => ({ id: item.id, ref: item.ref, context: item.context, principle: item.principle, matched: item.matched,
          value: state.answers[item.id].value, label: state.answers[item.id].label })) };
      if (!config.workerUrl) { renderThanks(false); return; }
      try {
        const response = await fetch(config.workerUrl + '/api/submit?t=' + encodeURIComponent(token), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error('submission failed');
        clear(); renderThanks(true);
      } catch (_) { renderThanks(false); }
    }

    app.addEventListener('change', (event) => {
      if (!event.target.matches('input[type="radio"]')) return;
      const section = q.sections[state.page - 1];
      const id = event.target.name.replace(/^q_/, '');
      const value = Number(event.target.value);
      state.answers[id] = { value, label: scaleFor(section)[value - 1] };
      save();
      const next = app.querySelector('[data-action="next"]');
      if (next) next.disabled = !pageComplete(section);
    });

    app.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      if (button.dataset.action === 'restart') { clear(); location.reload(); return; }
      if (button.dataset.action === 'back') { state.page--; save(); render(); return; }
      if (button.dataset.action !== 'next') return;
      if (state.page === 0) {
        state.page = 1; save(); render(); return;
      }
      const section = q.sections[state.page - 1];
      if (!pageComplete(section)) { document.getElementById('answerError').hidden = false; return; }
      if (state.page === 4) { submit(); return; }
      state.page++; save(); render();
    });

    function render() { window.scrollTo(0, 0); state.page === 0 ? renderFront() : renderSection(); }
    render();
  }
})();
