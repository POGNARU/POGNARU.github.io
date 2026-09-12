/* 문구는 검토용 초안. 공개 목록에는 API가 승인한 댓글만 표시합니다. */
(() => {
  'use strict';
  const endpoint = document.querySelector('meta[name="comments-api"]')?.content.trim();
  const messages = {
    rate_limited: '말씀을 잠시 쉬어 두었다가 다시 남겨 주세요.',
    invalid_body: '댓글은 1자부터 500자까지 남겨 주세요.',
    invalid_nickname: '부르실 이름은 40자 안으로 적어 주세요.',
    too_many_links: '링크를 조금 줄여서 다시 남겨 주세요.',
  };
  const node = (tag, className, content) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;
    return element;
  };
  async function request(payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload), signal: controller.signal, credentials: 'omit',
      });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'unavailable');
      return result;
    } finally { clearTimeout(timeout); }
  }
  document.querySelectorAll('details.news-comments').forEach(details => {
    const root = details.querySelector('.comments-content');
    const newsId = details.dataset.newsId;
    let initialized = false;
    details.addEventListener('toggle', () => {
      if (!details.open || initialized) return;
      initialized = true;
      if (!endpoint) {
        root.append(node('p', 'comment-status', '댓글을 남기실 자리를 준비하고 있습니다.'));
        return;
      }
      const status = node('p', 'comment-status');
      status.setAttribute('role', 'status');
      const list = node('ul', 'comments-list');
      list.setAttribute('aria-label', '공개된 댓글');
      const more = node('button', 'btn-quiet', '댓글 더 읽기');
      more.type = 'button'; more.hidden = true;
      const retry = node('button', 'btn-quiet', '다시 읽기');
      retry.type = 'button'; retry.hidden = true;
      root.append(status, list, more, retry);
      let cursor;
      let loading = false;
      const seen = new Set();
      async function load() {
        if (loading) return;
        loading = true; more.disabled = true; retry.hidden = true;
        status.textContent = '남겨 주신 말씀을 읽어 오고 있습니다.';
        status.dataset.error = 'false';
        try {
          const payload = {op: 'list', news_id: newsId};
          if (cursor) payload.cursor = cursor;
          const result = await request(payload);
          if (!Array.isArray(result.comments)) throw new Error('unavailable');
          result.comments.forEach(comment => {
            if (!comment || typeof comment.id !== 'string' || typeof comment.body !== 'string' || seen.has(comment.id)) return;
            seen.add(comment.id);
            const item = node('li', 'comment-item');
            const meta = node('div', 'comment-meta');
            meta.append(node('span', 'comment-name', comment.nickname || '익명'));
            const date = new Date(comment.created_at);
            if (!Number.isNaN(date.getTime())) {
              const time = node('time', '', new Intl.DateTimeFormat('ko-KR', {year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul'}).format(date));
              time.dateTime = date.toISOString(); meta.append(time);
            }
            item.append(meta, node('p', 'comment-body', comment.body)); list.append(item);
          });
          cursor = typeof result.cursor === 'string' ? result.cursor : undefined;
          more.hidden = !cursor;
          status.textContent = seen.size ? '' : '아직 나누어 주신 말씀이 없습니다.';
        } catch {
          status.textContent = '말씀을 읽어 오지 못했습니다. 잠시 뒤 다시 읽어 주세요.';
          status.dataset.error = 'true'; retry.hidden = false;
        } finally { loading = false; more.disabled = false; }
      }
      more.addEventListener('click', load); retry.addEventListener('click', load);
      const form = node('form', 'comment-form');
      const fields = node('fieldset');
      fields.append(node('legend', '', '말씀 남기기'));
      const hint = node('p', 'comment-hint', '남겨 주신 말씀은 확인한 뒤에 올려 두겠습니다.');
      fields.append(hint);
      function field(tag, name, labelText, maxLength) {
        const input = node(tag); input.name = name; input.id = `${newsId}-${name}`;
        input.maxLength = maxLength;
        const label = node('label', '', labelText); label.htmlFor = input.id;
        fields.append(label, input); return input;
      }
      const nickname = field('input', 'nickname', '부르실 이름 (안 적으셔도 됩니다)', 40);
      nickname.autocomplete = 'nickname';
      const body = field('textarea', 'body', '남기실 말씀', 500); body.required = true;
      const count = node('p', 'comment-hint', '0 / 500자'); count.id = `${newsId}-count`;
      body.setAttribute('aria-describedby', count.id); fields.append(count);
      body.addEventListener('input', () => { count.textContent = `${body.value.length} / 500자`; body.setCustomValidity(''); });
      const trap = node('div', 'comment-trap'); trap.setAttribute('aria-hidden', 'true');
      const website = node('input'); website.name = 'website'; website.tabIndex = -1; website.autocomplete = 'off';
      website.setAttribute('aria-label', '비워 두세요'); trap.append(website); fields.append(trap);
      const actions = node('div', 'comment-actions');
      const submit = node('button', 'btn', '남기기'); submit.type = 'submit';
      const feedback = node('p', 'comment-status'); feedback.setAttribute('role', 'status');
      actions.append(submit); fields.append(actions); form.append(fields, feedback); root.append(form);
      let submitting = false;
      form.addEventListener('submit', async event => {
        event.preventDefault(); if (submitting) return;
        if (!body.value.trim()) { body.setCustomValidity('남기실 말씀을 적어 주세요.'); body.reportValidity(); return; }
        submitting = true; fields.disabled = true; submit.textContent = '남기는 중';
        feedback.textContent = ''; feedback.dataset.error = 'false';
        try {
          const result = await request({op: 'add', news_id: newsId, nickname: nickname.value.trim(), body: body.value.trim(), website: website.value});
          if (result.ok !== true) throw new Error('unavailable');
          form.reset(); count.textContent = '0 / 500자';
          feedback.textContent = '말씀 고맙습니다. 확인한 뒤에 올려 두겠습니다.';
        } catch (error) {
          feedback.textContent = messages[error.message] || '말씀이 도착했는지 확인하지 못했습니다. 적으신 글은 그대로 두었습니다. 잠시 뒤 다시 남겨 주세요.';
          feedback.dataset.error = 'true';
        } finally { submitting = false; fields.disabled = false; submit.textContent = '남기기'; }
      });
      load();
    });
  });
})();
