// Progressive-enhancement script shared by all 3 Toolkit House wizards
// (D-004: no SPA framework) — /tools/family-agreement, /tools/phone-readiness,
// /tools/media-style-quiz. Talks to POST /api/tools/:slug/submit and
// GET /api/tools/submissions/:id/pdf (src/routes/tools.api.ts).
//
// Same structural pattern as public/static/ask-wizard.js: step nav via
// data-step/data-step-indicator/data-next/data-prev, localStorage
// autosave/restore, fetch-based submit. Extended here with:
//   - dynamic repeatable rows (family member list)
//   - Likert (1..5) radio-button question groups
//   - in-browser text preview render (per-tool renderer function)
//   - PDF download button wired to the signed-URL endpoint
(function () {
  var root = document.getElementById('tool-wizard-root');
  if (!root) return;

  var toolSlug = root.getAttribute('data-tool-slug');
  var isAuthenticated = root.getAttribute('data-authenticated') === '1';
  var STORAGE_KEY = 'tool_wizard_draft_' + toolSlug + '_v1';
  var form = document.getElementById('tool-wizard-form');
  if (!form) return;

  var currentStep = 1;
  var totalSteps = Number(root.getAttribute('data-total-steps') || '3');
  var lastSubmissionId = null;

  var ERROR_MESSAGES = {
    invalid_input: 'اطلاعات وارد‌شده نامعتبر است.',
    validation_error: 'اطلاعات وارد‌شده نامعتبر است.',
    unauthenticated: 'برای ذخیره و دریافت PDF باید وارد حساب خود شوید.',
  };

  function showError(message) {
    var el = document.getElementById('tool-wizard-error');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
  }

  function hideError() {
    var el = document.getElementById('tool-wizard-error');
    if (!el) return;
    el.classList.add('hidden');
  }

  // ---------- Step navigation ----------
  function goToStep(step) {
    if (step < 1 || step > totalSteps) return;
    currentStep = step;

    form.querySelectorAll('section[data-step]').forEach(function (section) {
      var sectionStep = Number(section.getAttribute('data-step'));
      section.classList.toggle('hidden', sectionStep !== step);
    });

    document.querySelectorAll('[data-step-indicator]').forEach(function (indicator) {
      var indicatorStep = Number(indicator.getAttribute('data-step-indicator'));
      if (indicatorStep === step) {
        indicator.classList.remove('bg-stone-100', 'text-stone-400');
        indicator.classList.add('bg-teal-800', 'text-white');
      } else {
        indicator.classList.remove('bg-teal-800', 'text-white');
        indicator.classList.add('bg-stone-100', 'text-stone-400');
      }
    });

    var progressBar = document.getElementById('tool-wizard-progress-bar');
    if (progressBar) {
      var pct = Math.round((step / totalSteps) * 100);
      progressBar.style.width = pct + '%';
    }

    saveDraftToStorage();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  form.querySelectorAll('[data-next]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!validateStep(currentStep)) return;
      goToStep(Number(btn.getAttribute('data-next')));
    });
  });
  form.querySelectorAll('[data-prev]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      goToStep(Number(btn.getAttribute('data-prev')));
    });
  });

  function validateStep(step) {
    var activeSection = form.querySelector('section[data-step="' + step + '"]');
    if (!activeSection) return true;
    var requiredFields = activeSection.querySelectorAll('[required]');
    for (var i = 0; i < requiredFields.length; i++) {
      var f = requiredFields[i];
      if (f.type === 'radio') {
        var group = activeSection.querySelectorAll('[name="' + f.name + '"]');
        var checked = Array.prototype.some.call(group, function (g) { return g.checked; });
        if (!checked) {
          alert('لطفاً همهٔ گزینه‌های این بخش را تکمیل کنید.');
          return false;
        }
      } else if (!f.value || !f.value.trim()) {
        alert('لطفاً فیلدهای ضروری این بخش را تکمیل کنید.');
        return false;
      }
    }
    return true;
  }

  // ---------- Dynamic repeatable rows (family member list) ----------
  var memberListEl = document.getElementById('family-member-list');
  var addMemberBtn = document.getElementById('add-family-member-btn');
  var memberRowTemplate = document.getElementById('family-member-row-template');

  function addMemberRow(prefillName, prefillRole) {
    if (!memberListEl || !memberRowTemplate) return;
    var clone = memberRowTemplate.content.firstElementChild.cloneNode(true);
    if (prefillName) clone.querySelector('[data-field="name"]').value = prefillName;
    if (prefillRole) clone.querySelector('[data-field="role"]').value = prefillRole;
    clone.querySelector('[data-remove-row]').addEventListener('click', function () {
      clone.remove();
      saveDraftToStorage();
    });
    memberListEl.appendChild(clone);
  }

  if (addMemberBtn) {
    addMemberBtn.addEventListener('click', function () {
      addMemberRow('', 'parent');
      saveDraftToStorage();
    });
  }

  function collectFamilyMembers() {
    if (!memberListEl) return [];
    var rows = memberListEl.querySelectorAll('[data-member-row]');
    var members = [];
    rows.forEach(function (row) {
      var name = row.querySelector('[data-field="name"]').value.trim();
      var role = row.querySelector('[data-field="role"]').value;
      if (name) members.push({ name: name, role: role });
    });
    return members;
  }

  // ---------- Multi-select chip groups (devices / sensitive situations / commitments) ----------
  function collectCheckedValues(name) {
    var els = form.querySelectorAll('[name="' + name + '"]:checked');
    return Array.prototype.map.call(els, function (el) { return el.value; });
  }

  function collectLines(name) {
    var el = form.querySelector('[name="' + name + '"]');
    if (!el) return [];
    return el.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  // ---------- Likert (1..5) answers ----------
  function collectLikertAnswers() {
    var answers = {};
    form.querySelectorAll('[data-likert]').forEach(function (group) {
      var qKey = group.getAttribute('data-likert');
      var checked = group.querySelector('input[type="radio"]:checked');
      if (checked) answers[qKey] = Number(checked.value);
    });
    return answers;
  }

  // ---------- Autosave (localStorage) — text/select fields only, not dynamic rows ----------
  function collectSimpleFieldData() {
    var data = {};
    var fields = form.querySelectorAll('input[name], select[name], textarea[name]');
    fields.forEach(function (field) {
      if (field.closest('[data-member-row]')) return;
      if (field.type === 'checkbox' || field.type === 'radio') return;
      data[field.name] = field.value;
    });
    return data;
  }

  function saveDraftToStorage() {
    try {
      var data = collectSimpleFieldData();
      data.__currentStep = currentStep;
      data.__familyMembers = collectFamilyMembers();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* private mode — ignore */ }
  }

  function restoreDraftFromStorage() {
    var raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return; }
    if (!raw) return;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }

    Object.keys(data).forEach(function (name) {
      if (name.indexOf('__') === 0) return;
      var field = form.querySelector('[name="' + name + '"]');
      if (field && field.type !== 'checkbox' && field.type !== 'radio') field.value = data[name];
    });

    if (data.__familyMembers && data.__familyMembers.length) {
      data.__familyMembers.forEach(function (m) { addMemberRow(m.name, m.role); });
    }
    if (data.__currentStep) goToStep(data.__currentStep);
  }

  function clearDraftStorage() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  form.addEventListener('input', saveDraftToStorage);
  form.addEventListener('change', saveDraftToStorage);

  // ---------- Preview renderers (per tool) ----------
  function renderPreview(result) {
    var box = document.getElementById('tool-wizard-preview');
    if (!box) return;
    var html = '';
    if (toolSlug === 'family_media_contract') {
      html += '<h3 class="font-bold text-stone-800 mb-2">اعضای خانواده</h3><ul class="list-disc pr-5 mb-4">' +
        result.familyMembers.map(function (m) { return '<li>' + m.name + ' (' + (m.role === 'parent' ? 'والد' : 'فرزند') + ')</li>'; }).join('') + '</ul>';
      html += '<h3 class="font-bold text-stone-800 mb-2">موقعیت‌های حساس</h3><ul class="list-disc pr-5 mb-4">' +
        result.sensitiveSituationLabels.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ul>';
      html += '<h3 class="font-bold text-stone-800 mb-2">تعهدهای والدین</h3><ul class="list-disc pr-5 mb-4">' +
        result.parentCommitments.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ul>';
      html += '<h3 class="font-bold text-stone-800 mb-2">تعهدهای فرزند</h3><ul class="list-disc pr-5 mb-4">' +
        result.childCommitments.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ul>';
      html += '<p class="text-stone-600">' + result.summaryFa + '</p>';
    } else if (toolSlug === 'phone_readiness_checklist') {
      html += '<p class="mb-3"><span class="font-bold">نتیجهٔ کلی:</span> ' + result.verdictLabelFa + ' (میانگین ' + result.overallScore.toFixed(1) + ' از ۵)</p>';
      html += '<h3 class="font-bold text-stone-800 mb-2">پیشنهادهای عملی</h3><ul class="list-disc pr-5">' +
        result.recommendationsFa.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ul>';
    } else if (toolSlug === 'media_style_quiz') {
      html += '<h3 class="font-bold text-stone-800 mb-2">نقاط قوت</h3><ul class="list-disc pr-5 mb-4">' +
        (result.strengthsFa.length ? result.strengthsFa.map(function (s) { return '<li>' + s + '</li>'; }).join('') : '<li>موردی ثبت نشد</li>') + '</ul>';
      html += '<h3 class="font-bold text-stone-800 mb-2">حوزه‌های نیازمند توجه</h3><ul class="list-disc pr-5 mb-4">' +
        (result.challengesFa.length ? result.challengesFa.map(function (s) { return '<li>' + s + '</li>'; }).join('') : '<li>موردی ثبت نشد</li>') + '</ul>';
      html += '<h3 class="font-bold text-stone-800 mb-2">برنامهٔ ۷ روزه</h3><ol class="list-decimal pr-5">' +
        result.sevenDayPlan.map(function (d) { return '<li>روز ' + d.day + ' — ' + d.titleFa + ': ' + d.actionFa + '</li>'; }).join('') + '</ol>';
    }
    box.innerHTML = html;
    box.classList.remove('hidden');
    document.getElementById('tool-wizard-preview-wrap').classList.remove('hidden');
  }

  // ---------- PDF download ----------
  var downloadBtn = document.getElementById('tool-wizard-download-pdf-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', async function () {
      if (!isAuthenticated) {
        showError('برای دریافت PDF باید وارد حساب خود شوید.');
        return;
      }
      if (!lastSubmissionId) {
        showError('ابتدا فرم را ارسال کنید تا نتیجه ذخیره شود.');
        return;
      }
      downloadBtn.disabled = true;
      downloadBtn.textContent = 'در حال تولید PDF...';
      try {
        var res = await fetch('/api/tools/submissions/' + lastSubmissionId + '/pdf');
        var result = await res.json();
        if (!res.ok) {
          showError(result.message || ERROR_MESSAGES[result.error] || 'دریافت PDF ناموفق بود.');
          return;
        }
        window.location.href = result.downloadUrl;
      } catch (e) {
        showError('ارتباط با سرور برقرار نشد.');
      } finally {
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'دانلود PDF';
      }
    });
  }

  // ---------- Submit ----------
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideError();

    var payload;
    if (toolSlug === 'family_media_contract') {
      payload = {
        familyMembers: collectFamilyMembers(),
        devices: collectCheckedValues('devices'),
        sensitiveSituations: collectCheckedValues('sensitiveSituations'),
        parentCommitments: collectLines('parentCommitmentsText'),
        childCommitments: collectLines('childCommitmentsText'),
        reviewDate: (form.querySelector('[name="reviewDate"]') || {}).value || '',
      };
    } else {
      payload = { answers: collectLikertAnswers() };
    }

    var submitBtn = document.getElementById('tool-wizard-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
      var res = await fetch('/api/tools/' + toolSlug + '/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      var data = await res.json();

      if (!res.ok) {
        showError(ERROR_MESSAGES[data.error] || data.message || 'خطایی رخ داد.');
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      clearDraftStorage();
      lastSubmissionId = data.submissionId;
      renderPreview(data.result);

      var savedNote = document.getElementById('tool-wizard-saved-note');
      if (savedNote) {
        savedNote.classList.remove('hidden');
        savedNote.textContent = data.submissionId
          ? 'نتیجه ذخیره شد. حالا می‌توانید فایل PDF را دانلود کنید.'
          : 'این یک پیش‌نمایش مهمان است و ذخیره نشد. برای ذخیره و دریافت PDF وارد حساب خود شوید.';
      }
      if (downloadBtn) downloadBtn.classList.toggle('hidden', !data.submissionId);

      window.scrollTo({ top: document.getElementById('tool-wizard-preview-wrap').offsetTop - 80, behavior: 'smooth' });
    } catch (err) {
      showError('ارتباط با سرور برقرار نشد.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // ---------- Init ----------
  restoreDraftFromStorage();
  if (memberListEl && memberListEl.children.length === 0) {
    addMemberRow('', 'parent');
    addMemberRow('', 'child');
  }
})();
