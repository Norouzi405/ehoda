// Progressive-enhancement script for /login (D-004: no SPA framework).
// Talks to the JSON API in src/routes/auth.ts.
(function () {
  var turnstileToken = null;
  var requestId = null;

  window.onTurnstileSuccess = function (token) {
    turnstileToken = token;
    document.getElementById('send-otp-btn').disabled = false;
  };

  function showError(elId, message) {
    var el = document.getElementById(elId);
    el.textContent = message;
    el.classList.remove('hidden');
  }

  function hideError(elId) {
    document.getElementById(elId).classList.add('hidden');
  }

  var ERROR_MESSAGES = {
    invalid_phone_number: 'شمارهٔ موبایل معتبر نیست.',
    captcha_failed: 'تأیید امنیتی ناموفق بود، دوباره تلاش کنید.',
    rate_limited: 'تعداد درخواست‌های شما بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.',
    cooldown: 'کد قبلی هنوز معتبر است، کمی صبر کنید.',
    sms_failed: 'ارسال پیامک ناموفق بود.',
    not_found: 'درخواست نامعتبر است.',
    expired: 'کد منقضی شده است، دوباره درخواست بدهید.',
    already_consumed: 'این کد قبلاً استفاده شده است.',
    too_many_attempts: 'تعداد تلاش‌های شما بیش از حد مجاز است.',
    invalid_code: 'کد وارد‌شده صحیح نیست.',
  };

  document.getElementById('send-otp-btn').addEventListener('click', async function () {
    hideError('otp-request-error');
    var phoneNumber = document.getElementById('phone-input').value.trim();
    if (!phoneNumber) {
      showError('otp-request-error', 'شمارهٔ موبایل را وارد کنید.');
      return;
    }

    try {
      var res = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phoneNumber, turnstileToken: turnstileToken }),
      });
      var data = await res.json();
      if (!res.ok) {
        showError('otp-request-error', ERROR_MESSAGES[data.error] || 'خطایی رخ داد.');
        return;
      }
      requestId = data.requestId;
      document.getElementById('otp-request-step').classList.add('hidden');
      document.getElementById('otp-verify-step').classList.remove('hidden');
    } catch (e) {
      showError('otp-request-error', 'ارتباط با سرور برقرار نشد.');
    }
  });

  document.getElementById('verify-otp-btn').addEventListener('click', async function () {
    hideError('otp-verify-error');
    var code = document.getElementById('code-input').value.trim();
    if (!code) {
      showError('otp-verify-error', 'کد را وارد کنید.');
      return;
    }

    try {
      var res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: requestId, code: code }),
      });
      var data = await res.json();
      if (!res.ok) {
        showError('otp-verify-error', ERROR_MESSAGES[data.error] || 'خطایی رخ داد.');
        return;
      }
      window.location.href = '/';
    } catch (e) {
      showError('otp-verify-error', 'ارتباط با سرور برقرار نشد.');
    }
  });
})();
