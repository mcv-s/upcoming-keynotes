#!/usr/bin/env python3
"""Generate the committed subscription feed from JSON, preserving event revisions."""
import argparse
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
META = ('DTSTAMP:', 'LAST-MODIFIED:', 'SEQUENCE:')

def text(value):
    return str(value).replace('\\', '\\\\').replace('\r\n', '\\n').replace('\n', '\\n').replace('\r', '\\n').replace(';', '\\;').replace(',', '\\,')

def stamp(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')

def fold(line):
    output, current, size = [], '', 0
    for character in line:
        length = len(character.encode('utf-8'))
        if size + length > 75:
            output.append(current)
            current, size = ' ', 1
        current += character
        size += length
    return '\r\n'.join(output + [current])

def read_events(content):
    """Unfold existing feed so unchanged events keep their revision metadata."""
    lines = content.replace('\r\n', '\n').replace('\n ', '').replace('\n\t', '').splitlines()
    events, block = {}, None
    for line in lines:
        if line == 'BEGIN:VEVENT':
            block = []
        elif line == 'END:VEVENT' and block is not None:
            uid = next(item[4:] for item in block if item.startswith('UID:'))
            events[uid] = block
            block = None
        elif block is not None:
            block.append(line)
    return events

def payload(event, config):
    lines = [f"UID:{event['id']}@{config['uidDomain']}", 'SUMMARY:' + text(event['title'])]
    if event.get('start'):
        lines.append('DTSTART:' + stamp(event['start']))
        if event.get('end'):
            lines.append('DTEND:' + stamp(event['end']))
    else:
        lines.extend([
            'DTSTART;VALUE=DATE:' + event['date'].replace('-', ''),
            'DTEND;VALUE=DATE:' + (date.fromisoformat(event.get('endDate', event['date'])) + timedelta(days=1)).strftime('%Y%m%d')
        ])
    disclaimer = ('Conference dates; see the event for individual keynote times.' if event['kind'] == 'conference' else
                  'All-day placeholder: keynote time pending.' if not event.get('start') else
                  'End time not announced.' if not event.get('end') else '')
    description = '\n'.join(filter(None, [event['description'], event.get('note'), disclaimer, 'Official source: ' + event.get('source', event['url'])]))
    lines.extend(['DESCRIPTION:' + text(description), 'LOCATION:' + text(event['location']), 'URL:' + event['url'],
                  'STATUS:' + event.get('status', 'CONFIRMED')])
    return lines

def generate(data, config, previous='', now=None):
    now = now or datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    prior = read_events(previous)
    lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Upcoming//Keynote Calendar//EN', 'CALSCALE:GREGORIAN',
             'METHOD:PUBLISH', 'X-WR-CALNAME:' + text(config['calendarName']), 'X-WR-CALDESC:' + text(config['calendarDescription']),
             f"REFRESH-INTERVAL;VALUE=DURATION:PT{config['refreshHours']}H", f"X-PUBLISHED-TTL:PT{config['refreshHours']}H"]
    current_uids = set()
    for event in sorted(data['events'], key=lambda item: item['id']):
        body = payload(event, config)
        uid = body[0][4:]
        current_uids.add(uid)
        old = prior.get(uid, [])
        if [line for line in old if not line.startswith(META)] == body:
            metadata = [line for line in old if line.startswith(META)]
        else:
            sequence = next((int(line[9:]) for line in old if line.startswith('SEQUENCE:')), -1) + 1
            metadata = [f'DTSTAMP:{now}', f'LAST-MODIFIED:{now}', f'SEQUENCE:{sequence}']
        lines.extend(['BEGIN:VEVENT'] + body + metadata + ['END:VEVENT'])
    # If a record was removed accidentally, retain a cancellation tombstone. This
    # prevents orphaned events in subscribers' calendars and preserves UID history.
    for uid in sorted(set(prior) - current_uids):
        old = prior[uid]
        body = [line for line in old if not line.startswith(META + ('STATUS:',))] + ['STATUS:CANCELLED']
        already_cancelled = 'STATUS:CANCELLED' in old
        sequence = next((int(line[9:]) for line in old if line.startswith('SEQUENCE:')), 0)
        metadata = [line for line in old if line.startswith(META)] if already_cancelled else [f'DTSTAMP:{now}', f'LAST-MODIFIED:{now}', f'SEQUENCE:{sequence + 1}']
        lines.extend(['BEGIN:VEVENT'] + body + metadata + ['END:VEVENT'])
    lines.append('END:VCALENDAR')
    return ('\r\n'.join(fold(line) for line in lines) + '\r\n').encode('utf-8')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Fail if JSON and committed ICS differ')
    args = parser.parse_args()
    config = json.loads((ROOT / 'site.json').read_text())
    data = json.loads((ROOT / 'events.json').read_text())
    target = ROOT / config['calendarFile']
    previous = target.read_bytes() if target.exists() else b''
    output = generate(data, config, previous.decode('utf-8'))
    if args.check:
        if output != previous:
            raise SystemExit('Calendar is out of date. Run python3 generate_calendar.py')
        print('PASS: committed ICS matches JSON.')
    else:
        companies = json.loads((ROOT / 'companies.json').read_text())
        names = {item['company'] for item in companies['companies']}
        research_list = ROOT / 'tracked-companies.txt'
        extra = set(research_list.read_text().splitlines()) - names if research_list.exists() else set()
        if extra:
            raise SystemExit('Preserve new research seeds by adding them to companies.json first: ' + ', '.join(sorted(extra)))
        (ROOT / 'tracked-companies.txt').write_text('\n'.join(item['company'] for item in companies['companies']) + '\n')
        target.write_bytes(output)
        print(f'Generated {target.name} from events.json and site.json.')

if __name__ == '__main__':
    main()
