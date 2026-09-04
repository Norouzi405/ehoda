// Progressive-enhancement script for /porseshkadeh/ask (D-004: no SPA framework).
// 3-step wizard: classification -> problem statement -> privacy/consent+captcha+submit.
// Talks to the JSON API in src/routes/porseshkadeh.api.ts (POST /api/porseshkadeh).
(function () {
  var STORAGE_KEY = 'porseshkadeh_ask_draft_v1';
  var form = document.getElementById('ask-wizard-form');
  if (!form) return;

  var turnstileToken = null;
  var currentStep = 1;
  var TOTAL_STEPS = 3;

  window.onAskTurnstileSuccess = function (token) {
    turnstileToken = token;
    var submitBtn = document.getElementById('submit-question-btn');
    if (submitBtn) submitBtn.disabled = false;
  };

  var ERROR_MESSAGES = {
    invalid_input: 'اطلاعات وارد‌شده نامعتبر است.',
    validation_error: 'اطلاعات وارد‌شده نامعتبر است.',
    captcha_failed: 'تأیید امنیتی ناموفق بود، دوباره تلاش کنید.',
    unauthenticated: 'برای ثبت پرسش باید وارد حساب خود شوید.',
  };

  function showError(message) {
    var el = document.getElementById('submit-question-error');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
  }

  function hideError() {
    var el = document.getElementById('submit-question-error');
    if (!el) return;
    el.classList.add('hidden');
  }

  // ---------- Autosave (localStorage) ----------
  function collectFormData() {
    var data = {};
    var fields = form.querySelectorAll('input[name], select[name], textarea[name]');
    fields.forEach(function (field) {
      if (field.type === 'checkbox') {
        data[field.name] = field.checked;
      } else if (field.type === 'radio') {
        if (field.checked) data[field.name] = field.value;
      } else {
        data[field.name] = field.value;
      }
    });
    return data;
  }

  function saveDraftToStorage() {
    try {
      var data = collectFormData();
      data.__currentStep = currentStep;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      /* localStorage may be unavailable (private mode) — fail silently */
    }
  }

  function restoreDraftFromStorage() {
    var raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return;
    }
    if (!raw) return;
    var data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return;
    }

    Object.keys(data).forEach(function (name) {
      if (name === '__currentStep') return;
      var field = form.querySelector('[name="' + name + '"]');
      if (!field) return;
      if (field.type === 'checkbox') {
        field.checked = Boolean(data[name]);
      } else if (field.type === 'radio') {
        var radio = form.querySelector('[name="' + name + '"][value="' + data[name] + '"]');
        if (radio) radio.checked = true;
      } else {
        field.value = data[name];
      }
    });

    if (data.__currentStep) {
      goToStep(data.__currentStep);
    }
  }

  function clearDraftStorage() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  form.addEventListener('input', saveDraftToStorage);
  form.addEventListener('change', function (e) {
    saveDraftToStorage();
    // Informational note: manually choosing "private referral only" means
    // the question will never appear in the public queue — tell the user
    // up-front (server-side crisis triage may ALSO force this outcome
    // automatically regardless of the user's choice; that server decision
    // is only known after submission and is handled in handleSubmit()).
    if (e.target && e.target.name === 'publicationChoice') {
      var note = document.getElementById('crisis-triage-note');
      if (note) {
        if (e.target.value === 'private_referral_only') {
          note.classList.remove('hidden');
        } else {
          note.classList.add('hidden');
        }
      }
    }
  });

  // ---------- Step navigation ----------
  function validateStep(step) {
    if (step === 2) {
      var title = form.querySelector('[name="rawTitle"]').value.trim();
      var whatHappened = form.querySelector('[name="rawWhatHappened"]').value.trim();
      if (title.length < 3) {
        alert('لطفاً عنوان پرسش را کامل کنید (حداقل ۳ کاراکتر).');
        return false;
      }
      if (whatHappened.length < 50) {
        alert('شرح رویداد باید حداقل ۵۰ کاراکتر باشد.');
        return false;
      }
    }
    return true;
  }

  function goToStep(step) {
    if (step < 1 || step > TOTAL_STEPS) return;
    currentStep = step;

    form.querySelectorAll('section[data-step]').forEach(function (section) {
      var sectionStep = Number(section.getAttribute('data-step'));
      section.classList.toggle('hidden', sectionStep !== step);
    });

    document.querySelectorAll('[data-step-indicator]').forEach(function (indicator) {
      var indicatorStep = Number(indicator.getAttribute('data-step-indicator'));
      if (indicatorStep === step) {
        indicator.classList.remove('bg-gray-100', 'text-gray-500');
        indicator.classList.add('bg-teal-700', 'text-white');
      } else {
        indicator.classList.remove('bg-teal-700', 'text-white');
        indicator.classList.add('bg-gray-100', 'text-gray-500');
      }
    });

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

  // ---------- Submit ----------
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideError();

    var consentCheckbox = document.getElementById('consent-checkbox');
    if (!consentCheckbox || !consentCheckbox.checked) {
      showError('برای ارسال پرسش باید با شرایط حریم خصوصی موافقت کنید.');
      return;
    }
    if (!turnstileToken) {
      showError('لطفاً تأیید امنیتی (کپچا) را کامل کنید.');
      return;
    }

    var data = collectFormData();
    var payload = {
      authorRole: data.authorRole,
      contextSpace: data.contextSpace,
      categorySlug: data.categorySlug || undefined,
      ageGroupSlug: data.ageGroupSlug || undefined,
      isRecurring: Boolean(data.isRecurring),
      urgencyLevel: data.urgencyLevel,
      rawTitle: (data.rawTitle || '').trim(),
      rawWhatHappened: (data.rawWhatHappened || '').trim(),
      rawSinceWhen: data.rawSinceWhen || undefined,
      rawTriedSoFar: data.rawTriedSoFar || undefined,
      rawHelpRequested: data.rawHelpRequested || undefined,
      publicationChoice: data.publicationChoice || 'publish_after_anonymization',
      turnstileToken: turnstileToken,
    };

    var submitBtn = document.getElementById('submit-question-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
      var res = await fetch('/api/porseshkadeh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      var result = await res.json();

      if (!res.ok) {
        showError(ERROR_MESSAGES[result.error] || result.message || 'خطایی رخ داد.');
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      // Success — the draft is no longer needed locally.
      clearDraftStorage();

      // Crisis Triage Filter (spec §9.11): the server may have forced
      // private_referral regardless of the user's own publicationChoice.
      if (result.isCrisis) {
        window.location.href = '/porseshkadeh/crisis-help';
      } else if (result.status === 'private_referral') {
        window.location.href = '/porseshkadeh/crisis-help';
      } else {
        window.location.href = '/porseshkadeh/' + result.slug;
      }
    } catch (err) {
      showError('ارتباط با سرور برقرار نشد.');
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // ---------- Init ----------
  restoreDraftFromStorage();
})();
