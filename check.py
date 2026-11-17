#!/usr/bin/env python3
"""Validate the JSON sources, static files, and generated calendar."""
import json
import re
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlsplit
from generate_calendar import generate

root = Path(__file__).resolve().parent

def https(value):
    parsed = urlsplit(value)
    assert parsed.scheme == 'https' and parsed.netloc and not any(c in value for c in '\r\n'), f'Invalid URL: {value}'

def timestamp(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    assert result.tzinfo is not None, f'Timestamp needs UTC offset: {value}'
    return result

data = json.loads((root / 'events.json').read_text())
config = json.loads((root / 'site.json').read_text())
companies = json.loads((root / 'companies.json').read_text())
date.fromisoformat(data['updated'])
date.fromisoformat(companies['updated'])
https(config['publishedUrl'])
assert config['publishedUrl'].endswith('/')
assert re.fullmatch(r'[a-z0-9-]+\.ics', config['calendarFile'])
assert re.fullmatch(r'[a-z0-9.-]+', config['uidDomain'])
assert isinstance(config['refreshHours'], int) and config['refreshHours'] > 0
assert isinstance(config['staleAfterDays'], int) and config['staleAfterDays'] > 0
ids = set()
for event in data['events']:
    for key in ('id', 'company', 'mark', 'color', 'title', 'category', 'kind', 'date', 'location', 'speaker', 'description', 'url', 'checked'):
        assert event.get(key), f'Missing {key}: {event}'
    assert event['id'] not in ids, f"Duplicate ID: {event['id']}"
    ids.add(event['id'])
    assert re.fullmatch(r'[a-z0-9-]+', event['id'])
    assert event['kind'] in ('keynote', 'conference')
    assert event.get('status', 'CONFIRMED') in ('CONFIRMED', 'CANCELLED', 'TENTATIVE')
    assert re.fullmatch(r'#[0-9a-fA-F]{6}', event['color'])
    start_date = date.fromisoformat(event['date'])
    date.fromisoformat(event['checked'])
    if 'endDate' in event:
        assert date.fromisoformat(event['endDate']) >= start_date
    if 'start' in event:
        timestamp(event['start'])
    if 'end' in event:
        assert 'start' in event and timestamp(event['end']) > timestamp(event['start'])
    for key in ('url', 'source'):
        if key in event:
            https(event[key])
names = []
for company in companies['companies']:
    assert all(company.get(key) for key in ('company', 'mark', 'color', 'event', 'url'))
    assert re.fullmatch(r'#[0-9a-fA-F]{6}', company['color'])
    https(company['url'])
    names.append(company['company'])
assert len(names) == len(set(names)), 'Duplicate company'
assert (root / 'tracked-companies.txt').read_text().splitlines() == names, 'Research list differs from companies.json; run generator'
html = (root / 'index.html').read_text()
for asset in re.findall(r'(?:href|src)="\./([^"#]*)"', html):
    if asset:
        assert (root / asset).is_file(), f'Missing asset: {asset}'
assert (root / '.nojekyll').is_file()
feed = (root / config['calendarFile']).read_bytes()
assert feed == generate(data, config, feed.decode('utf-8')), 'ICS is stale; run python3 generate_calendar.py'
assert feed.endswith(b'END:VCALENDAR\r\n')
assert all(len(line) <= 75 for line in feed.split(b'\r\n')), 'Unfolded ICS line exceeds 75 octets'
print(f"PASS: {len(ids)} events, {len(names)} research sources, static assets, and synchronized ICS.")
