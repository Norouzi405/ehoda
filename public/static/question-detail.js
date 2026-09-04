// Progressive-enhancement script for /porseshkadeh/:slug (D-004: no SPA framework).
// Handles: reply-tree expand/collapse, reply-context autofill, helpful-vote,
// report-violation modal, and top-level answer submission.
// Talks to the JSON API in src/routes/porseshkadeh.api.ts.
(function () {
  var slug = window.__QUESTION_SLUG__;
  if (!slug) return;

  var REPORT_REASONS = [
    { value: 'insult', label: 'توهین یا بی‌احترامی' },
    { value: 'personal_info', label: 'افشای اطلاعات هویتی/شخصی' },
    { value: 'advertising', label: 'تبلیغات نامرتبط' },
    { value: 'dangerous_advice', label: 'توصیهٔ خطرناک یا غیرعلمی' },
    { value: 'off_topic', label: 'خارج از موضوع' },
    { value: 'misinformation', label: 'اطلاعات نادرست' },
    { value: 'other', label: 'سایر' },
  ];

  // ---------- Show-more-replies (depth-based collapse) ----------
  document.querySelectorAll('.show-more-replies').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetId = btn.getAttribute('data-target');
      var target = document.getElementById(targetId);
      if (target) {
        target.classList.remove('hidden');
        btn.classList.add('hidden');
      }
    });
  });

  // ---------- Helpful vote ----------
  function bindVoteButtons(root) {
    root.querySelectorAll('.vote-btn').forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', async function () {
        var responseId = btn.getAttribute('data-response-id');
        try {
          var res = await fetch('/api/porseshkadeh/responses/' + responseId + '/vote', { method: 'POST' });
          var data = await res.json();
          if (!res.ok) {
            if (data.error === 'already_voted') {
              btn.classList.add('text-teal-700');
              btn.disabled = true;
            } else if (data.error === 'unauthenticated') {
              window.location.href = '/login';
            }
            return;
          }
          // Bump the visible counter without a full reload.
          var match = btn.textContent.match(/\((\d+)\)/);
          var current = match ? parseInt(match[1], 10) : 0;
          btn.innerHTML = '<i class="fas fa-thumbs-up"></i> مفید بود (' + (current + 1) + ')';
          btn.classList.add('text-teal-700');
          btn.disabled = true;
        } catch (e) {
          /* network error: silently ignore, user can retry */
        }
      });
    });
  }

  // ---------- Reply context autofill ----------
  var answerBody = document.getElementById('answer-body');
  var replyContext = document.getElementById('reply-context');
  var cancelReplyBtn = document.getElementById('cancel-reply-btn');
  var currentReplyTarget = null; // { responseId, displayName }

  function bindReplyButtons(root) {
    root.querySelectorAll('.reply-btn').forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function () {
        if (!answerBody) {
          window.location.href = '/login';
          return;
        }
        var responseId = btn.getAttribute('data-response-id');
        var displayName = btn.getAttribute('data-display-name') || 'کاربر';
        currentReplyTarget = { responseId: responseId, displayName: displayName };

        if (replyContext) {
          replyContext.textContent = 'در پاسخ به ' + displayName;
          replyContext.classList.remove('hidden');
        }
        if (cancelReplyBtn) cancelReplyBtn.classList.remove('hidden');

        answerBody.focus();
        document.getElementById('answer-box').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  if (cancelReplyBtn) {
    cancelReplyBtn.addEventListener('click', function () {
      currentReplyTarget = null;
      if (replyContext) replyContext.classList.add('hidden');
      cancelReplyBtn.classList.add('hidden');
    });
  }

  // ---------- Report violation modal ----------
  var activeReportResponseId = null;

  function buildReportModal() {
    var overlay = document.createElement('div');
    overlay.id = 'report-modal-overlay';
    overlay.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50';

    var box = document.createElement('div');
    box.className = 'bg-white rounded-2xl p-6 max-w-sm w-full mx-4';

    var title = document.createElement('h3');
    title.className = 'font-bold text-gray-900 mb-4';
    title.textContent = 'گزارش تخلف';
    box.appendChild(title);

    var select = document.createElement('select');
    select.id = 'report-modal-reason';
    select.className = 'w-full border rounded-lg px-3 py-2.5 mb-3';
    REPORT_REASONS.forEach(function (r) {
      var opt = document.createElement('option');
      opt.value = r.value;
      opt.textContent = r.label;
      select.appendChild(opt);
    });
    box.appendChild(select);

    var note = document.createElement('textarea');
    note.id = 'report-modal-note';
    note.rows = 3;
    note.placeholder = 'توضیح تکمیلی (اختیاری)';
    note.className = 'w-full border rounded-lg px-3 py-2.5 mb-4';
    box.appendChild(note);

    var actions = document.createElement('div');
    actions.className = 'flex justify-end gap-2';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm';
    cancelBtn.textContent = 'انصراف';
    cancelBtn.addEventListener('click', closeReportModal);

    var submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700';
    submitBtn.textContent = 'ارسال گزارش';
    submitBtn.addEventListener('click', submitReport);

    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    box.appendChild(actions);

    overlay.appendChild(box);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeReportModal();
    });
    return overlay;
  }

  function openReportModal(responseId) {
    activeReportResponseId = responseId;
    var modal = buildReportModal();
    document.body.appendChild(modal);
  }

  function closeReportModal() {
    var overlay = document.getElementById('report-modal-overlay');
    if (overlay) overlay.remove();
    activeReportResponseId = null;
  }

  async function submitReport() {
    if (!activeReportResponseId) return;
    var reason = document.getElementById('report-modal-reason').value;
    var note = document.getElementById('report-modal-note').value.trim();

    try {
      var res = await fetch('/api/porseshkadeh/responses/' + activeReportResponseId + '/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason, note: note || undefined }),
      });
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      closeReportModal();
      alert('گزارش شما ثبت شد. سپاسگزاریم.');
    } catch (e) {
      closeReportModal();
      alert('ارتباط با سرور برقرار نشد.');
    }
  }

  function bindReportButtons(root) {
    root.querySelectorAll('.report-btn').forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function () {
        openReportModal(btn.getAttribute('data-response-id'));
      });
    });
  }

  var tree = document.getElementById('response-tree');
  if (tree) {
    bindVoteButtons(tree);
    bindReplyButtons(tree);
    bindReportButtons(tree);
  }

  // ---------- Answer submit ----------
  var submitAnswerBtn = document.getElementById('submit-answer-btn');
  var asExperienceCheckbox = document.getElementById('as-experience-checkbox');
  var answerError = document.getElementById('answer-error');

  function showAnswerError(message) {
    if (!answerError) return;
    answerError.textContent = message;
    answerError.classList.remove('hidden');
  }

  function hideAnswerError() {
    if (!answerError) return;
    answerError.classList.add('hidden');
  }

  if (submitAnswerBtn) {
    submitAnswerBtn.addEventListener('click', async function () {
      hideAnswerError();
      var body = answerBody.value.trim();
      if (body.length < 2) {
        showAnswerError('متن پاسخ الزامی است.');
        return;
      }

      var payload = {
        body: body,
        parentId: currentReplyTarget ? Number(currentReplyTarget.responseId) : undefined,
        replyToDisplayName: currentReplyTarget ? currentReplyTarget.displayName : undefined,
        // Self-tagging checkbox only meaningful for a top-level answer.
        asExperience: !currentReplyTarget && asExperienceCheckbox ? asExperienceCheckbox.checked : false,
      };

      submitAnswerBtn.disabled = true;
      try {
        var res = await fetch('/api/porseshkadeh/' + slug + '/responses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        var data = await res.json();
        if (!res.ok) {
          if (data.error === 'unauthenticated') {
            window.location.href = '/login';
            return;
          }
          showAnswerError(data.message || 'خطایی رخ داد.');
          submitAnswerBtn.disabled = false;
          return;
        }

        // Success: the response goes to moderation (or publishes instantly
        // for fast-publish professionals) — either way, reload to show the
        // updated tree/state rather than guessing at partial DOM insertion.
        window.location.reload();
      } catch (e) {
        showAnswerError('ارتباط با سرور برقرار نشد.');
        submitAnswerBtn.disabled = false;
      }
    });
  }
})();
