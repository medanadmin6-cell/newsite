(function (window, document) {
  'use strict';

  const defaults = {
    assetBase: '/withdrawal-notification/assets',
    brandName: 'Velora',
    alertDuration: 2200,
    bannerDuration: 5000,
    playSound: true
  };

  let settings = Object.assign({}, defaults);
  let hideTimer = null;

  function requireMoney(value, fieldName) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      throw new Error(fieldName + ' must be a real non-negative number from the server.');
    }
    return number;
  }

  function formatMoney(value, currency) {
    const amount = requireMoney(value, 'Money value');
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    } catch (error) {
      return currency + ' ' + amount.toFixed(2);
    }
  }

  function createUi() {
    if (document.getElementById('withdrawalIosBanner')) return;

    const overlay = document.createElement('div');
    overlay.id = 'withdrawalIosOverlay';
    overlay.className = 'withdrawal-ios-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<section class="withdrawal-ios-alert" role="alertdialog" aria-modal="true" aria-labelledby="withdrawalIosTitle">',
      '  <div class="withdrawal-ios-alert__content">',
      '    <h2 class="withdrawal-ios-alert__title" id="withdrawalIosTitle">Withdrawal successful</h2>',
      '    <p class="withdrawal-ios-alert__message" id="withdrawalIosAlertMessage"></p>',
      '  </div>',
      '  <button class="withdrawal-ios-alert__button" type="button" id="withdrawalIosOkay">OK</button>',
      '</section>'
    ].join('');

    const banner = document.createElement('aside');
    banner.id = 'withdrawalIosBanner';
    banner.className = 'withdrawal-ios-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.innerHTML = [
      '<div class="withdrawal-ios-banner__art">',
      '  <img class="withdrawal-ios-banner__image" id="withdrawalIosImage" alt="Mobile money notification">',
      '  <div class="withdrawal-ios-banner__message">',
      '    <span class="withdrawal-ios-banner__line" id="withdrawalIosPaymentLine"></span>',
      '    <span class="withdrawal-ios-banner__line" id="withdrawalIosBalanceLine"></span>',
      '  </div>',
      '</div>',
      '<audio id="withdrawalIosAudio" preload="auto"></audio>'
    ].join('');

    document.body.appendChild(overlay);
    document.body.appendChild(banner);
    document.getElementById('withdrawalIosOkay').addEventListener('click', closeAlertAndShowBanner);
  }

  function closeAlertAndShowBanner() {
    const overlay = document.getElementById('withdrawalIosOverlay');
    if (overlay) {
      overlay.classList.remove('is-visible');
      overlay.setAttribute('aria-hidden', 'true');
    }
    showBanner();
  }

  function playTone() {
    if (!settings.playSound) return;
    const audio = document.getElementById('withdrawalIosAudio');
    if (!audio) return;
    audio.currentTime = 0;
    const result = audio.play();
    if (result && typeof result.catch === 'function') result.catch(function () {});
  }

  function showBanner() {
    const banner = document.getElementById('withdrawalIosBanner');
    if (!banner) return;
    clearTimeout(hideTimer);
    banner.classList.remove('is-leaving');
    void banner.offsetWidth;
    banner.classList.add('is-visible');
    playTone();
    hideTimer = window.setTimeout(hide, settings.bannerDuration);
  }

  function hide() {
    const banner = document.getElementById('withdrawalIosBanner');
    if (!banner || !banner.classList.contains('is-visible')) return;
    banner.classList.remove('is-visible');
    banner.classList.add('is-leaving');
    window.setTimeout(function () {
      banner.classList.remove('is-leaving');
    }, 380);
  }

  function show(options) {
    const data = Object.assign({}, settings, options || {});
    const amount = requireMoney(data.amount, 'amount');
    const currentBalance = requireMoney(data.currentBalance, 'currentBalance');
    const currency = String(data.currency || 'GHS').toUpperCase();

    createUi();
    settings = Object.assign({}, settings, data);

    document.getElementById('withdrawalIosImage').src = settings.assetBase.replace(/\/$/, '') + '/ab-mobilemoney-light.png';
    document.getElementById('withdrawalIosAudio').src = settings.assetBase.replace(/\/$/, '') + '/tone.mp3';
    document.getElementById('withdrawalIosAlertMessage').textContent =
      'Your withdrawal of ' + formatMoney(amount, currency) + ' was completed.';
    document.getElementById('withdrawalIosPaymentLine').textContent =
      'Payment received for ' + formatMoney(amount, currency) + ' from ' + settings.brandName + '.';
    document.getElementById('withdrawalIosBalanceLine').textContent =
      'Current Balance: ' + formatMoney(currentBalance, currency) +
      '. Available Balance: ' + formatMoney(currentBalance, currency);

    const overlay = document.getElementById('withdrawalIosOverlay');
    overlay.classList.add('is-visible');
    overlay.setAttribute('aria-hidden', 'false');

    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(closeAlertAndShowBanner, settings.alertDuration);

    window.dispatchEvent(new CustomEvent('withdrawal:completed', {
      detail: { amount: amount, currentBalance: currentBalance, currency: currency }
    }));
  }

  function configure(options) {
    settings = Object.assign({}, settings, options || {});
    createUi();
  }

  window.WithdrawalNotification = {
    configure: configure,
    show: show,
    hide: hide
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createUi, { once: true });
  } else {
    createUi();
  }
})(window, document);
