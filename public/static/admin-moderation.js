// Progressive-enhancement script shared by the three admin moderation
// queues (/admin/moderation/questions, /responses, /reports).
// D-004: no SPA framework. Talks to the JSON API in
// src/routes/porseshkadeh.api.ts. Each handled card is simply removed from
// the DOM on success, since the underlying record leaves that status queue.
(function () {
  function removeCard(selectorAttr, id) {
    var card = document.querySelector('[' + selectorAttr + '="' + id + '"]');
    if (card) card.remove();
  }

  // ---------- Questions queue ----------
  document.querySelectorAll('.mod-question-btn').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var id = btn.getAttribute('data-id');
      var action = btn.getAttribute('data-action');
      var payload = { action: action };

      if (action === 'reject') {
        var reason = window.prompt('دلیل رد پرسش را وارد کنید (اختیاری):', '') || undefined;
        payload.reason = reason;
      } else if (action === 'crisis_referral') {
        var note = window.prompt('یادداشت ارجاع بحران (اختیاری):', '') || undefined;
        payload.note = note;
      }

      btn.disabled = true;
      try {
        var res = await fetch('/admin/moderation/questions/' + id, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.status === 401 || res.status === 403) {
          alert('دسترسی لازم برای این عملیات را ندارید.');
          btn.disabled = false;
          return;
        }
        if (!res.ok) {
          var data = await res.json().catch(function () { return {}; });
          alert(data.message || 'عملیات ناموفق بود.');
          btn.disabled = false;
          return;
        }
        removeCard('data-question-id', id);
      } catch (e) {
        alert('ارتباط با سرور برقرار نشد.');
        btn.disabled = false;
      }
    });
  });

  // ---------- Responses queue ----------
  document.querySelectorAll('.mod-response-btn').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var id = btn.getAttribute('data-id');
      var action = btn.getAttribute('data-action');
      var payload = { action: action };

      if (action === 'hide' || action === 'delete') {
        var confirmMsg = action === 'delete'
          ? 'این پاسخ به‌صورت غیرقابل‌بازگشت با نظیرِ جای‌گذاری «[این نظر توسط کاربر/ناظر حذف شده است]» جایگزین می‌شود. ادامه می‌دهید؟'
          : 'این پاسخ از دید عمومی پنهان می‌شود (قابل بازگشت). ادامه می‌دهید؟';
        if (!window.confirm(confirmMsg)) return;
        var reason = window.prompt('دلیل (اختیاری):', '') || undefined;
        payload.reason = reason;
      }

      btn.disabled = true;
      try {
        var res = await fetch('/admin/moderation/responses/' + id, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.status === 401 || res.status === 403) {
          alert('دسترسی لازم برای این عملیات را ندارید.');
          btn.disabled = false;
          return;
        }
        if (!res.ok) {
          var data = await res.json().catch(function () { return {}; });
          alert(data.message || 'عملیات ناموفق بود.');
          btn.disabled = false;
          return;
        }
        // approve/hide/delete remove the card from THIS queue view;
        // editor_pick just toggles a badge, so reload to reflect it in place.
        if (action === 'editor_pick') {
          window.location.reload();
        } else {
          removeCard('data-response-id', id);
        }
      } catch (e) {
        alert('ارتباط با سرور برقرار نشد.');
        btn.disabled = false;
      }
    });
  });

  // ---------- Reports queue ----------
  document.querySelectorAll('.report-resolve-btn').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var id = btn.getAttribute('data-id');
      var status = btn.getAttribute('data-status');
      var card = document.querySelector('[data-report-id="' + id + '"]');
      var select = card ? card.querySelector('.report-penalty-select') : null;
      var penalty = select ? select.value : 'none';

      if (penalty === 'suspend_user' && !window.confirm('این کاربر به‌طور موقت (۷ روز) از ارسال پاسخ محروم می‌شود. ادامه می‌دهید؟')) {
        return;
      }
      if (penalty === 'warn_user' && !window.confirm('اخطار به این کاربر ارسال می‌شود. ادامه می‌دهید؟')) {
        return;
      }

      btn.disabled = true;
      try {
        var res = await fetch('/admin/moderation/reports/' + id, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: status, penalty: penalty }),
        });
        if (res.status === 401 || res.status === 403) {
          var data403 = await res.json().catch(function () { return {}; });
          alert(
            data403.required_permission
              ? 'برای اعمال این مجازات به مجوز «' + data403.required_permission + '» نیاز دارید.'
              : 'دسترسی لازم برای این عملیات را ندارید.'
          );
          btn.disabled = false;
          return;
        }
        if (!res.ok) {
          var data = await res.json().catch(function () { return {}; });
          alert(data.message || 'عملیات ناموفق بود.');
          btn.disabled = false;
          return;
        }
        removeCard('data-report-id', id);
      } catch (e) {
        alert('ارتباط با سرور برقرار نشد.');
        btn.disabled = false;
      }
    });
  });
})();
