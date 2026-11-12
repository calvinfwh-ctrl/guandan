/* 应用入口：视图切换 + 级牌管理 */
(function (root, doc) {
  'use strict';
  var GD = root.GD, UI = root.UI;

  var VIEWS = {
    rules: root.ViewRules,
    quiz: root.ViewQuiz,
    lab: root.ViewLab,
    split: root.ViewSplit,
    play: root.ViewPlay
  };

  var App = {
    level: 2,
    view: 'rules',
    mounted: {},

    init: function () {
      var saved = 0;
      try { saved = parseInt(root.localStorage.getItem('gd-level'), 10); } catch (e) { saved = 0; }
      if (saved >= 2 && saved <= 14) this.level = saved;

      this.buildLevelPicker();

      var self = this;
      doc.getElementById('tabs').addEventListener('click', function (ev) {
        var btn = ev.target.closest('.tab');
        if (btn) self.setView(btn.getAttribute('data-view'));
      });

      this.setView('play');
    },

    buildLevelPicker: function () {
      var self = this;
      var box = doc.getElementById('levelOptions');
      var html = '';
      for (var r = 2; r <= 14; r++) {
        html += '<button data-level="' + r + '"' + (r === this.level ? ' class="is-active"' : '') + '>' +
          GD.RANK_TEXT[r] + '</button>';
      }
      box.innerHTML = html;
      box.addEventListener('click', function (ev) {
        var btn = ev.target.closest('button[data-level]');
        if (btn) self.setLevel(parseInt(btn.getAttribute('data-level'), 10));
      });
    },

    setLevel: function (level) {
      if (level === this.level) return;
      this.level = level;
      try { root.localStorage.setItem('gd-level', String(level)); } catch (e) { }
      UI.$$('#levelOptions button').forEach(function (b) {
        b.classList.toggle('is-active', parseInt(b.getAttribute('data-level'), 10) === level);
      });
      var v = VIEWS[this.view];
      if (v) v.render(doc.getElementById('view-' + this.view), level);
    },

    /* 供实战视图单向同步：把顶部"当前级牌"选择器亮到对局实际级数。
       不触发视图重渲染（避免与 ViewPlay.paint 互相递归）；
       用户手动点选择器仍走 setLevel，教学页示例随之刷新。 */
    syncLevel: function (level) {
      if (!level || level === this.level) return;
      this.level = level;
      try { root.localStorage.setItem('gd-level', String(level)); } catch (e) { }
      UI.$$('#levelOptions button').forEach(function (b) {
        b.classList.toggle('is-active', parseInt(b.getAttribute('data-level'), 10) === level);
      });
    },

    setView: function (name) {
      if (!VIEWS[name]) return;
      this.view = name;
      UI.$$('.tab').forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-view') === name);
      });
      UI.$$('.view').forEach(function (sec) {
        sec.classList.toggle('is-active', sec.id === 'view-' + name);
      });
      var el = doc.getElementById('view-' + name);
      var v = VIEWS[name];
      if (!this.mounted[name]) {
        if (v.mount) v.mount(el);
        this.mounted[name] = true;
      }
      doc.body.classList.toggle('in-match', name === 'play');
      v.render(el, this.level);
      root.scrollTo(0, 0);
    }
  };

  root.App = App;
  App.init();
})(window, document);
