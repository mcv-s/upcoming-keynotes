'use strict';

const $ = (selector) => document.querySelector(selector);
const icon = (name, filled = false) => `<i class="${filled ? 'ph-fill' : 'ph'} ph-${name}" aria-hidden="true"></i>`;
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
let data;
let config;
let companiesData;
let filter = 'all';
let visibleEvents = [];
let saved = new Set();
try {
  const stored = JSON.parse(localStorage.getItem('upcoming-saved') || '[]');
  if (Array.isArray(stored)) saved = new Set(stored.filter(id => typeof id === 'string'));
} catch { /* The calendar still works when browser storage is unavailable. */ }

function zone() {
  return $('#timezone').value === 'local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : $('#timezone').value;
}
function format(value, options, timeZone = zone()) {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).format(new Date(value));
}
function dateOnly(date, options) {
  return format(date + 'T12:00:00Z', options, 'UTC');
}
function displayDay(event) {
  return event.start ? format(event.start, {year:'numeric', month:'2-digit', day:'2-digit'}).split('/').map(Number) : null;
}
function monthKey(event) {
  if (!event.start) return event.date.slice(0, 7);
  const [month, , year] = displayDay(event);
  return `${year}-${String(month).padStart(2,'0')}`;
}
function isUpcoming(event, now = Date.now()) {
  // Keep date-only events through their final day in the host's time zone.
  if (event.status === 'CANCELLED') return false;
  if (event.start) return new Date(event.end || event.start).getTime() > now;
  return (event.endDate || event.date) >= format(new Date(now), {year:'numeric', month:'2-digit', day:'2-digit'}, 'America/Los_Angeles').replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$1-$2');
}
function sortDate(event) {
  if (!event.start) return event.date + 'T00:00';
  const [month, day, year] = displayDay(event);
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T` + format(event.start, {hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
}
function when(event) {
  if (event.start) return format(event.start, {month:'short', day:'numeric'}) + ' · ' + format(event.start, {hour:'numeric', minute:'2-digit', timeZoneName:'short'});
  const start = dateOnly(event.date, {month:'short', day:'numeric'});
  return event.endDate ? `${start}–${dateOnly(event.endDate, event.date.slice(0,7) === event.endDate.slice(0,7) ? {day:'numeric'} : {month:'short', day:'numeric'})}` : start;
}
function brandCandidates(item) {
  const profile = companiesData?.companies.find(company => company.company === item.company);
  const name = item.iconName ?? profile?.iconName;
  return typeof name === 'string' && /^[a-z0-9-]+$/.test(name) ? [name] : [];
}
function mark(item) {
  return `<span class="company-mark ${item.company === 'AWS' ? 'aws' : ''}" style="--company-color:${escapeHTML(item.color)}" aria-hidden="true"><i class="brand-logo ph" data-brand-candidates="${escapeHTML(brandCandidates(item).join(','))}"></i><span class="brand-fallback">${escapeHTML(item.mark)}</span></span>`;
}
const brandFontLoads = new Map();
function resolveBrandIcons() {
  document.querySelectorAll('[data-brand-candidates]').forEach(element => {
    const candidates = element.dataset.brandCandidates.split(',');
    let found = false;
    for (const candidate of candidates) {
      element.className = `brand-logo ph ph-${candidate}`;
      const glyph = getComputedStyle(element, '::before').content;
      if (glyph && !['none','normal','""',"''"].includes(glyph)) { found = true; break; }
    }
    if (!found) {
      element.parentElement.classList.remove('has-brand');
      element.className = 'brand-logo ph';
      return;
    }
    // A CSS rule alone isn't enough: keep the letter if the font fails to load.
    const glyph = getComputedStyle(element, '::before').content.replace(/^["']|["']$/g, '');
    if (!brandFontLoads.has(glyph)) {
      brandFontLoads.set(glyph, document.fonts.load('23px "Phosphor"', glyph).then(fonts => fonts.length > 0).catch(() => false));
    }
    brandFontLoads.get(glyph).then(loaded => {
      if (element.isConnected) element.parentElement.classList.toggle('has-brand', loaded);
    });
  });
}
window.addEventListener('load', resolveBrandIcons);
document.fonts?.ready.then(resolveBrandIcons);
document.fonts?.addEventListener('loadingdone', resolveBrandIcons);

function renderFeatured(events) {
  const event = events.find(item => item.kind === 'keynote' && item.start && new Date(item.start).getTime() > Date.now());
  if (!event) { $('#featured').innerHTML = ''; return; }
  const days = Math.ceil((new Date(event.start) - Date.now()) / 86400000);
  $('#featured').innerHTML = `<article class="featured"><div class="featured-content"><span class="eyebrow"><span class="green-dot"></span> NEXT ON THE MAIN STAGE</span><h2>${escapeHTML(event.title)}</h2><p>${escapeHTML(event.company)} &nbsp; / &nbsp; ${escapeHTML(when(event))} &nbsp; / &nbsp; ${escapeHTML(event.location)}</p><div class="featured-actions"><a class="button primary" href="${escapeHTML(event.url)}" target="_blank" rel="noopener noreferrer">Official event ${icon('arrow-up-right')}</a><button class="button secondary" data-calendar="${escapeHTML(event.id)}">${icon('calendar-plus')} Add to calendar</button></div></div><div class="countdown"><strong>${days}</strong><span>${days === 1 ? 'DAY TO GO' : 'DAYS TO GO'}</span><small>${escapeHTML(dateOnly(event.date, {month:'short', day:'numeric', year:'numeric'}))}</small></div></article>`;
}
const attendanceFormats = {
  in_person: {label:'In person', icon:'users', detail:'In-person attendance confirmed. See event details for online availability.'},
  online: {label:'Online', icon:'broadcast', detail:'Watch online.'},
  hybrid: {label:'Both', icon:'globe', detail:'In-person and online attendance available.'},
  unknown: {label:'Pending', icon:'question', detail:'Attendance format has not been confirmed.'}
};
function matchesAttendance(event, selected) {
  const value = event.attendance || 'unknown';
  return selected === 'all' || value === selected || (value === 'hybrid' && ['in_person','online'].includes(selected));
}
function eventCard(event) {
  const number = event.start ? format(event.start, {day:'2-digit'}) : dateOnly(event.date, {day:'2-digit'});
  const weekday = event.start ? format(event.start, {weekday:'short'}) : dateOnly(event.date, {weekday:'short'});
  const time = event.start ? format(event.start, {hour:'numeric', minute:'2-digit', timeZoneName:'short'}) : event.kind === 'conference' ? when(event) : 'Time pending';
  const attendance = attendanceFormats[event.attendance] || attendanceFormats.unknown;
  const label = `${saved.has(event.id) ? 'Unsave' : 'Save'} ${event.title}`;
  const place = event.venueLabel || event.location.replace(/\s*\+\s*(online|virtual|Salesforce\+|select content online)$/i, '').replace(/\s*\+\s*Salesforce\+$/i, '');
  const allDayNote = event.kind === 'conference' ? 'Calendar covers the conference dates.' : !event.start ? 'Calendar uses an all-day placeholder until a time is announced.' : !event.end ? 'End time not announced.' : '';
  return `<article class="event"><div class="date"><strong>${escapeHTML(number)}</strong><span>${escapeHTML(weekday)}</span><span class="attendance-label attendance-${escapeHTML(event.attendance || 'unknown')}" title="${escapeHTML(attendance.detail)}">${icon(attendance.icon)}<span>${attendance.label}</span></span></div>${mark(event)}<div class="event-info"><div class="company-label">${escapeHTML(event.company)}</div><h3><a href="${escapeHTML(event.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(event.title)}</a></h3><details><summary>Details ${icon('caret-down')}</summary><div class="event-detail-body"><p class="detail-speaker">${icon('microphone-stage')} ${escapeHTML(event.speaker)}</p><p>${escapeHTML(event.description)}</p>${event.note ? `<p>${escapeHTML(event.note)}</p>` : ''}<p>${escapeHTML(event.attendanceNotes || attendance.detail)} ${escapeHTML(allDayNote)}</p><p class="detail-source"><a href="${escapeHTML(event.source || event.url)}" target="_blank" rel="noopener noreferrer">Official source ${icon('arrow-up-right')}</a><span>Checked ${escapeHTML(dateOnly(event.checked || data.updated, {month:'short', day:'numeric', year:'numeric'}))}</span></p></div></details></div><div class="event-time"><span>${event.start ? icon('clock') : event.kind === 'conference' ? icon('calendar-blank') : ''}${escapeHTML(time)}</span><small>${icon(event.attendance === 'online' ? 'broadcast' : 'map-pin')}${escapeHTML(event.attendance === 'online' ? 'Online' : place)}</small></div><div class="event-actions"><button class="icon-button" data-save="${escapeHTML(event.id)}" aria-pressed="${saved.has(event.id)}" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}">${icon('star', saved.has(event.id))}</button><button class="icon-button" data-calendar="${escapeHTML(event.id)}" aria-label="Add ${escapeHTML(event.title)} to calendar" title="Add to calendar">${icon('calendar-plus')}</button></div></article>`;
}
function render() {
  if (!data) return;
  const query = $('#search').value.trim().toLowerCase();
  const company = $('#company').value;
  const upcoming = data.events.filter(event => isUpcoming(event)).sort((a,b) => sortDate(a).localeCompare(sortDate(b)));
  visibleEvents = upcoming.filter(event => (company === 'all' || event.company === company) && matchesAttendance(event, $('#attendance').value) && (filter === 'all' || (filter === 'saved' ? saved.has(event.id) : event.kind === filter)) && [event.company, event.title, event.category, event.location, event.speaker, event.description].join(' ').toLowerCase().includes(query));
  let month = '';
  $('#events').innerHTML = visibleEvents.map(event => {
    const key = monthKey(event);
    let heading = '';
    if (key !== month) {
      month = key;
      heading = `<h3 class="month-title">${escapeHTML(dateOnly(`${key}-01`, {month:'long'}))} <span>${key.slice(0,4)}</span></h3>`;
    }
    return heading + eventCard(event);
  }).join('') || `<div class="empty">${filter === 'saved' ? 'No saved upcoming events match these filters. Use the star button to save an event.' : 'No upcoming events match these filters.'}<button class="button secondary" data-reset>Reset filters</button></div>`;
  $('#event-count').textContent = visibleEvents.length;
  $('#saved-count').textContent = upcoming.filter(event => saved.has(event.id)).length;
  $('#result-message').textContent = `${visibleEvents.length} upcoming events found.`;
  $('#zone-label').textContent = `Times in ${zone().replaceAll('_', ' ')}`;
  $('#export').disabled = visibleEvents.length === 0;
  renderFeatured(upcoming);
  resolveBrandIcons();
}

// RFC 5545 escaping and UTF-8 line folding keep exports valid in major calendar apps.
function icalText(value) { return String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,'); }
function icalDate(date) { return date.replaceAll('-', ''); }
function icalTime(date) { return new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function nextDay(date) { const day = new Date(date + 'T00:00:00Z'); day.setUTCDate(day.getUTCDate() + 1); return day.toISOString().slice(0,10); }
function fold(line) {
  let result = '', current = '', length = 0;
  for (const character of line) {
    const bytes = new TextEncoder().encode(character).length;
    if (length + bytes > 75) { result += current + '\r\n'; current = ' '; length = 1; }
    current += character; length += bytes;
  }
  return result + current;
}
function calendar(events) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Upcoming//Keynote Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const event of events) {
    lines.push('BEGIN:VEVENT', `UID:${event.id}@upcoming-keynotes`, `DTSTAMP:${icalTime(new Date())}`, `SUMMARY:${icalText(event.title)}`);
    if (event.start) {
      lines.push(`DTSTART:${icalTime(event.start)}`);
      if (event.end) lines.push(`DTEND:${icalTime(event.end)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${icalDate(event.date)}`, `DTEND;VALUE=DATE:${icalDate(nextDay(event.endDate || event.date))}`);
    }
    const disclaimer = event.kind === 'conference' ? 'Conference dates only. Keynote schedule pending.' : !event.start ? 'All-day placeholder. Keynote time pending.' : !event.end ? 'End time not announced.' : '';
    lines.push(`DESCRIPTION:${icalText([event.description, event.note, 'Attendance: ' + (attendanceFormats[event.attendance] || attendanceFormats.unknown).detail, event.attendanceNotes, disclaimer, 'Source: ' + (event.source || event.url), 'Snapshot checked: ' + data.updated + '. This download will not update automatically.'].filter(Boolean).join('\n'))}`, `LOCATION:${icalText(event.location)}`, `URL:${event.url}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
function download(events, name) {
  const url = URL.createObjectURL(new Blob([calendar(events)], {type:'text/calendar;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#copy-calendar').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#calendar-url').value); $('#copy-status').textContent = 'Copied. Paste this URL into your calendar’s subscription option.'; }
  catch { $('#calendar-url').focus(); $('#calendar-url').select(); $('#copy-status').textContent = 'Select and copy the URL above.'; }
});
$('#search').addEventListener('input', render);
$('#company').addEventListener('change', render);
$('#attendance').addEventListener('change', render);
$('#timezone').addEventListener('change', render);
$('.tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-filter]'); if (!button) return;
  filter = button.dataset.filter;
  document.querySelectorAll('.tab').forEach(tab => { tab.classList.toggle('active', tab === button); tab.setAttribute('aria-pressed', String(tab === button)); });
  render();
});
$('#export').addEventListener('click', () => download(visibleEvents, 'upcoming-keynotes.ics'));
document.addEventListener('click', event => {
  const save = event.target.closest('[data-save]');
  if (save) {
    const id = save.dataset.save; saved.has(id) ? saved.delete(id) : saved.add(id);
    try { localStorage.setItem('upcoming-saved', JSON.stringify([...saved])); } catch { /* In-memory saves remain usable. */ }
    render();
    document.querySelector(`[data-save="${CSS.escape(id)}"]`)?.focus();
  }
  const add = event.target.closest('[data-calendar]');
  if (add && data) { const item = data.events.find(item => item.id === add.dataset.calendar); if (item) download([item], `${item.id}.ics`); }
  if (event.target.closest('[data-reset]')) {
    $('#search').value = ''; $('#company').value = 'all'; $('#attendance').value = 'all'; $('[data-filter="all"]').click(); $('#search').focus();
  }
});
async function load() {
  try {
    const response = await fetch('./events.json', {cache:'no-cache'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
    const [configResponse, companiesResponse] = await Promise.all([fetch('./site.json', {cache:'no-cache'}), fetch('./companies.json', {cache:'no-cache'})]);
    if (!configResponse.ok || !companiesResponse.ok) throw new Error('Unable to load configuration');
    config = await configResponse.json();
    companiesData = await companiesResponse.json();
    const calendarUrl = new URL(config.calendarFile, config.publishedUrl).href;
    $('#calendar-url').value = calendarUrl;
    $('#open-calendar').href = calendarUrl.replace(/^https?:/, 'webcal:');
    $('#feed-file').href = './' + config.calendarFile;
    $('#watchlist-count').textContent = companiesData.companies.length;
    $('#checked-date').textContent = `Last checked ${dateOnly(data.updated, {month:'short', day:'numeric', year:'numeric'})}`;
    const companies = [...new Set([...data.events.map(event => event.company), ...companiesData.companies.map(item => item.company)])].sort();
    $('#company').insertAdjacentHTML('beforeend', companies.map(company => `<option value="${escapeHTML(company)}">${escapeHTML(company)}</option>`).join(''));
    $('#radar').innerHTML = companiesData.companies.map(item => `<a class="radar-card" href="${escapeHTML(item.url)}" target="_blank" rel="noopener noreferrer"><div class="radar-top">${mark(item)}${icon('arrow-up-right')}</div><strong>${escapeHTML(item.company)}</strong><small>${escapeHTML(item.event)}</small></a>`).join('');
    const age = (Date.now() - new Date(data.updated + 'T00:00:00Z')) / 86400000;
    if (age > config.staleAfterDays) { $('#stale-notice').hidden = false; $('#stale-notice').textContent = `This edition was checked on ${data.updated}. It is over ${config.staleAfterDays} days old; consult the official sources for newer announcements.`; }
    render();
    setInterval(render, 60000);
  } catch (error) {
    $('#events').innerHTML = '<p class="empty">The event list could not be loaded. Run the local preview server (python3 serve.py), or refresh the hosted page.</p>';
    $('#checked-date').textContent = 'Event data unavailable';
    console.error('Unable to load event data:', error);
  }
}
load();
