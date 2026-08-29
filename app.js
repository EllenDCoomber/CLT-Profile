(() => {
  const app = document.getElementById('app');
  const config = window.CLT_CONFIG;
  const bundled = window.CLT_QUESTIONS;

  const esc = (text) =>
    String(text).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));

  const params = new URLSearchParams(location.search);
  const token = params.get('t');
  const hasToken = token !== null;
  const role = hasToken && token === config.roles.leader ? 'leader' : hasToken && token === config.roles.member ? 'member' : null;
  const assessment = params.get('a') || '';

  if (hasToken && !role) {
    app.innerHTML =
      '<div class="notice"><h1>' + esc(bundled.title) + '</h1>' +
      '<p>This survey link isn\u2019t recognised. Please use the link you were sent.</p></div>';
    return;
  }

  if (!hasToken) {
    document.title = bundled.title;
    const launcherRoles = [
      { key: 'leader', label: 'Team Leader version', primary: true },
      { key: 'member', label: 'Team Member version', primary: false }
    ];
    app.innerHTML =
      '<div class="screen"><h1>' + esc(bundled.title) + '</h1>' +
      '<p class="subtitle">Choose which version to open.</p>' +
      '<div class="launch">' +
      launcherRoles.map((item) =>
        '<a class="btn' + (item.primary ? ' primary' : '') + '" href="?t=' + config.roles[item.key] + '">' +
        item.label + '</a>'
      ).join('') +
      '</div>' +
      (config.adminUrl
        ? '<p class="admin-link"><a href="' + esc(config.adminUrl) + '">View results portal (admin)</a></p>'
        : '') +
      '</div>';
    return;
  }

  async function resolveQuestions() {
    if (assessment && config.workerUrl) {
      try {
        const res = await fetch(config.workerUrl + '/api/questions/' + encodeURIComponent(assessment));
        if (res.ok) return await res.json();
      } catch (e) {
        /* fall through to bundled */
      }
    }
    return bundled;
  }

  resolveQuestions().then(start);

  function start(q) {
  const storageKey = 'clt_profile_' + role + (assessment ? '_' + assessment : '');
  const store = {
    load() {
      try {
        return JSON.parse(localStorage.getItem(storageKey)) || {};
      } catch {
        return {};
      }
    },
    save(data) {
      localStorage.setItem(storageKey, JSON.stringify(data));
    },
    clear() {
      localStorage.removeItem(storageKey);
    }
  };

  const intro = q.intro[role];
  document.title = intro.heading;

  const teamScreens = Math.ceil(q.team.length / config.questionsPerScreen);
  const lastScreen = 1 + teamScreens;
  const totalQuestions = q.personal.length + q.team.length;

  const restore = store.load();

  function shuffleQuestions(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = a[i];
      a[i] = a[j];
      a[j] = swap;
    }
    return a;
  }

  const teamIds = q.team.map((item) => item.id);
  const teamById = new Map(q.team.map((item) => [item.id, item]));
  const savedOrderValid =
    Array.isArray(restore.order) &&
    restore.order.length === teamIds.length &&
    new Set(restore.order).size === teamIds.length &&
    restore.order.every((id) => teamById.has(id));
  let order = savedOrderValid ? restore.order : shuffleQuestions(teamIds);

  function buildRanges() {
    const ranges = [];
    for (let i = 0; i < teamScreens; i++) {
      ranges.push(order.slice(i * config.questionsPerScreen, (i + 1) * config.questionsPerScreen).map((id) => teamById.get(id)));
    }
    return ranges;
  }

  let teamRanges = buildRanges();

  const state = {
    screen: restore.screen >= 0 && restore.screen <= lastScreen ? restore.screen : 0,
    introStep: restore.introStep >= 0 && restore.introStep <= 2 ? restore.introStep : 0,
    answers: restore.answers || {},
    company: restore.company || '',
    department: restore.department || ''
  };

  let continueBtn = null;

  function persist() {
    store.save({
      screen: state.screen,
      introStep: state.introStep,
      answers: state.answers,
      company: state.company,
      department: state.department,
      order
    });
  }

  function currentQuestions() {
    if (state.screen === 1) return q.personal;
    if (state.screen >= 2) return teamRanges[state.screen - 2];
    return [];
  }

  function screenComplete() {
    return currentQuestions().every((item) => state.answers[item.id] && state.answers[item.id].value != null);
  }

  function answeredCount() {
    const ids = new Set([...q.personal, ...q.team].map((item) => item.id));
    return Object.keys(state.answers).filter((id) => ids.has(id) && state.answers[id].value != null).length;
  }

  function scaleFor(item) {
    return q.personal.some((p) => p.id === item.id) ? q.personalScale : q.teamScale;
  }

  function questionBlock(item) {
    const scale = scaleFor(item);
    const options = scale
      .map((label, i) => {
        const checked = state.answers[item.id] && state.answers[item.id].value === i + 1 ? ' checked' : '';
        return (
          '<label>' +
          '<input type="radio" name="q_' + item.id + '" value="' + (i + 1) + '"' + checked + '>' +
          '<span>' + esc(label) + '</span></label>'
        );
      })
      .join('');
    return '<div class="q" data-qid="' + item.id + '"><div class="statement">' +
      esc(item.text) + '</div><fieldset class="scale" data-count="' + scale.length + '">' + options +
      '</fieldset></div>';
  }

  function progressBar() {
    const done = answeredCount();
    const isIntro = state.screen === 0;
    const left = isIntro
      ? '<span>Getting ready</span><span>Step ' + (state.introStep + 1) + ' of 3</span>'
      : '<span>' + done + ' of ' + totalQuestions + ' answered</span><span>Screen ' +
        (state.screen + 1) + ' of ' + (lastScreen + 1) + '</span>';
    const pct = isIntro ? ((state.introStep + 1) / 3) * 100 : (done / totalQuestions) * 100;
    app.insertAdjacentHTML(
      'afterbegin',
      '<div class="progress">' +
        '<div class="meta">' + left + '</div>' +
        '<div class="bar"><span style="width:' + Math.round(pct) + '%"></span></div></div>'
    );
  }

  function render() {
    app.innerHTML = '';
    window.scrollTo(0, 0);
  }

  function renderIntro() {
    render();
    progressBar();
    if (state.introStep === 1) renderIntroFields();
    else if (state.introStep === 2) renderIntroInstructions();
    else renderIntroWelcome();
  }

  function renderIntroWelcome() {
    app.insertAdjacentHTML(
      'beforeend',
      '<div class="screen intro"><h1>' + esc(intro.heading) + '</h1>' +
        '<p class="pill">Takes about ' + esc(intro.timing) + '</p>' +
        '<div class="lead">' + intro.lead.map((p) => '<p>' + esc(p) + '</p>').join('') + '</div>' +
        '<nav><button type="button" class="primary" data-action="intro-next">Continue</button></nav>' +
        '<button type="button" class="ghost" data-action="restart">Start over \u2014 clear my answers</button></div>'
    );
  }

  function renderIntroFields() {
    const reqMark = ' <span class="required-marker">*</span>';
    app.insertAdjacentHTML(
      'beforeend',
      '<div class="screen intro"><h1>' + esc(q.beforeBeginHeading) + '</h1>' +
        '<div class="field"><label>Company name' + reqMark + '</label>' +
        '<input type="text" id="company" value="' + esc(state.company) + '" autocomplete="organization"></div>' +
        '<div class="field"><label>Department/Team' + reqMark + '</label>' +
        '<input type="text" id="department" value="' + esc(state.department) + '" autocomplete="organization"></div>' +
        '<p id="fieldError" class="error" hidden>Please enter your company name and department/team before continuing.</p>' +
        '<h2>' + esc(intro.aboutHeading) + '</h2>' +
        '<div class="lead">' + intro.about.map((p) => '<p>' + esc(p) + '</p>').join('') + '</div>' +
        '<nav>' +
        '<button type="button" data-action="intro-back">Back</button>' +
        '<button type="button" class="primary" data-action="intro-next">Continue</button>' +
        '</nav></div>'
    );

    document.getElementById('company').addEventListener('input', (e) => {
      state.company = e.target.value;
      persist();
    });
    document.getElementById('department').addEventListener('input', (e) => {
      state.department = e.target.value;
      persist();
    });
  }

  function renderIntroInstructions() {
    app.insertAdjacentHTML(
      'beforeend',
      '<div class="screen intro"><h1>' + esc(intro.instructionsHeading) + '</h1>' +
        '<div class="lead">' + intro.instructions.map((p) => '<p>' + esc(p) + '</p>').join('') + '</div>' +
        '<p>' + esc(intro.scaleIntro) + '</p>' +
        '<ul class="legend">' +
        q.teamScale.map((label) => '<li>' + esc(label) +
          (label === 'N/A' ? ' <em>(team questions only)</em>' : '') + '</li>').join('') +
        '</ul>' +
        '<p class="neo-hint">' + esc(intro.neoNote) + '</p>' +
        '<p class="signoff">' + esc(intro.thanks) + ' \u2014 ' + esc(intro.sign) + '</p>' +
        '<nav>' +
        '<button type="button" data-action="intro-back">Back</button>' +
        '<button type="button" class="primary" data-action="start">Begin</button>' +
        '</nav></div>'
    );
  }

  function renderQuestions() {
    render();
    progressBar();
    const items = currentQuestions();
    const isTeam = state.screen >= 2;
    const title = isTeam ? 'About the team' : 'About you';
    const subtitle = isTeam
      ? 'These statements ask about your experience of the leadership team. Please say how frequently each has been true in practice over the last three months.'
      : 'These first statements are about you and your experience. Please say how frequently each has been true in practice over the last three months.';
    const blocks = items.map((item) => questionBlock(item)).join('');
    const last = state.screen === lastScreen;
    const continueLabel = last ? 'Submit' : 'Continue';
    app.insertAdjacentHTML(
      'beforeend',
      '<div class="screen"><h1>' + title + '</h1>' +
        '<p class="subtitle">' + esc(subtitle) + '</p>' +
        (isTeam && state.screen === 2 ? '<p class="neo-hint">' + esc(intro.neoNote) + '</p>' : '') +
        blocks +
        '<p id="answerError" class="error" hidden>Please answer every statement before continuing.</p>' +
        '<nav>' +
        '<button type="button" data-action="back">Back</button>' +
        '<button type="button" class="primary" data-action="continue" disabled>' + continueLabel + '</button>' +
        '</nav></div>'
    );
    continueBtn = app.querySelector('[data-action="continue"]');
    updateContinue();
  }

  function updateContinue() {
    if (continueBtn) continueBtn.disabled = !screenComplete();
  }

  function renderThanks(saved) {
    render();
    const note = saved
      ? ''
      : '<p class="neo-hint">Your responses are ready but this survey isn\u2019t yet connected to its collection service, so nothing has been saved. This is the development version.</p>';
    app.insertAdjacentHTML(
      'beforeend',
      '<div class="screen"><h1>Thank you</h1>' +
        '<p class="subtitle">Your responses have been recorded.</p>' + note +
        '<p class="signoff">' + esc(intro.thanks) + '<br>' + esc(intro.sign) + '</p></div>'
    );
  }

  async function submit() {
    const payload = {
      role,
      assessment,
      company: state.company.trim(),
      department: state.department.trim(),
      submittedAt: new Date().toISOString(),
      answers: q.personal.concat(q.team).map((item) => {
        const record = state.answers[item.id] || {};
        return {
          id: item.id,
          ref: item.ref || null,
          context: item.context || null,
          principle: item.principle || null,
          matched: item.matched || null,
          value: record.value != null ? record.value : null,
          label: record.label || ''
        };
      })
    };
    store.clear();
    if (!config.workerUrl) {
      renderThanks(false);
      return;
    }
    try {
      const res = await fetch(config.workerUrl + '/api/submit?t=' + encodeURIComponent(token), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('submit failed');
      renderThanks(true);
    } catch (err) {
      renderThanks(false);
    }
  }

  app.addEventListener('change', (e) => {
    const input = e.target;
    if (input.matches('input[type="radio"]')) {
      const qid = input.name.replace(/^q_/, '');
      const scale = q.personal.some((p) => p.id === qid) ? q.personalScale : q.teamScale;
      const value = Number(input.value);
      state.answers[qid] = { value, label: scale[value - 1] };
      persist();
      updateContinue();
    }
  });

  app.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'restart') {
      store.clear();
      location.search = '';
    } else if (action === 'intro-next') {
      if (state.introStep === 0) {
        state.introStep = 1;
        persist();
        renderIntro();
      } else if (state.introStep === 1) {
        if (!state.company.trim() || !state.department.trim()) {
          document.getElementById('fieldError').hidden = false;
          return;
        }
        state.introStep = 2;
        persist();
        renderIntro();
      }
    } else if (action === 'intro-back') {
      state.introStep = Math.max(0, state.introStep - 1);
      persist();
      renderIntro();
    } else if (action === 'start') {
      if (!state.company.trim() || !state.department.trim()) {
        document.getElementById('fieldError').hidden = false;
        return;
      }
      state.screen = 1;
      state.introStep = 2;
      persist();
      renderQuestions();
    } else if (action === 'back') {
      if (state.screen === 1) {
        state.screen = 0;
        state.introStep = 2;
        persist();
        renderIntro();
      } else {
        state.screen = Math.max(0, state.screen - 1);
        persist();
        renderQuestions();
      }
    } else if (action === 'continue') {
      if (!screenComplete()) {
        document.getElementById('answerError').hidden = false;
        return;
      }
      if (state.screen === lastScreen) {
        submit();
      } else {
        state.screen += 1;
        persist();
        renderQuestions();
      }
    }
  });

  if (restore.screen >= 1 && restore.screen <= lastScreen) renderQuestions();
  else renderIntro();
  }
})();