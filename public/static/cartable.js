// Progressive-enhancement script for /porseshkadeh/cartable/respond/:questionId
// (D-004: no SPA framework). Handles draft-save + submit-for-review.
// Talks to the JSON API in src/routes/porseshkadeh.api.ts.
(function () {
  var saveDraftBtn = document.getElementById('save-draft-btn');
  var submitForReviewBtn = document.getElementById('submit-for-review-btn');
  if (!saveDraftBtn || !submitForReviewBtn) return;

  var questionIdInput = document.getElementById('cartable-question-id');
  var draftIdInput = document.getElementById('cartable-draft-id');
  var bodyTextarea = document.getElementById('cartable-body');
  var statusEl = document.getElementById('cartable-status');

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = 'text-sm mt-3 ' + (isError ? 'text-red-600' : 'text-teal-700');
  }

  // structuredMetaJson bundles the optional "خلاصهٔ مسئله" / "چه کاری نباید
  // انجام داد" fields so the response body stays free-text while these
  // structured hints ride along for future rendering/analytics use.
  function buildStructuredMeta() {
    var problemSummary = document.getElementById('meta-problem-summary');
    var whatNotToDo = document.getElementById('meta-what-not-to-do');
    var meta = {
      problemSummary: problemSummary ? problemSummary.value.trim() : '',
      whatNotToDo: whatNotToDo ? whatNotToDo.value.trim() : '',
    };
    if (!meta.problemSummary && !meta.whatNotToDo) return undefined;
    return JSON.stringify(meta);
  }

  async function saveDraft() {
    var body = bodyTextarea.value.trim();
    if (!body) {
      setStatus('متن پاسخ نمی‌تواند خالی باشد.', true);
      return null;
    }

    var payload = {
      questionId: Number(questionIdInput.value),
      body: body,
      structuredMetaJson: buildStructuredMeta(),
    };

    try {
      var res = await fetch('/api/porseshkadeh/cartable/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      var data = await res.json();
      if (!res.ok) {
        if (data.error === 'unauthenticated') {
          window.location.href = '/login';
          return null;
        }
        setStatus(data.message || 'ذخیرهٔ پیش‌نویس ناموفق بود.', true);
        return null;
      }
      draftIdInput.value = data.id;
      return data.id;
    } catch (e) {
      setStatus('ارتباط با سرور برقرار نشد.', true);
      return null;
    }
  }

  saveDraftBtn.addEventListener('click', async function () {
    saveDraftBtn.disabled = true;
    var id = await saveDraft();
    saveDraftBtn.disabled = false;
    if (id) setStatus('پیش‌نویس با موفقیت ذخیره شد.', false);
  });

  submitForReviewBtn.addEventListener('click', async function () {
    submitForReviewBtn.disabled = true;
    var draftId = await saveDraft();
    if (!draftId) {
      submitForReviewBtn.disabled = false;
      return;
    }

    try {
      var res = await fetch('/api/porseshkadeh/cartable/draft/' + draftId + '/submit', { method: 'POST' });
      var data = await res.json();
      if (!res.ok) {
        setStatus(data.error === 'not_a_draft' ? 'این پاسخ قبلاً ارسال شده است.' : 'ارسال برای بازبینی ناموفق بود.', true);
        submitForReviewBtn.disabled = false;
        return;
      }
      setStatus('پاسخ شما برای بازبینی ارسال شد.', false);
      setTimeout(function () {
        window.location.href = '/porseshkadeh/cartable';
      }, 1200);
    } catch (e) {
      setStatus('ارتباط با سرور برقرار نشد.', true);
      submitForReviewBtn.disabled = false;
    }
  });
})();
