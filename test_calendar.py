import copy
import unittest
from generate_calendar import generate, read_events

CONFIG = dict(uidDomain='example.test', calendarName='Keynotes', calendarDescription='A feed', refreshHours=12)
EVENT = dict(id='demo-2027', title='Demo, with Unicode: café', kind='keynote', date='2027-01-05',
             start='2027-01-05T09:30:00-08:00', description='Hello; world\nSecond line', location='Las Vegas', url='https://example.com/')

class CalendarTest(unittest.TestCase):
    def feed(self, events, previous='', now='20261117T120000Z'):
        return generate({'events': events}, CONFIG, previous, now).decode('utf-8')

    def test_unchanged_feed_is_byte_stable(self):
        first = self.feed([EVENT])
        self.assertEqual(first, self.feed([EVENT], first, '20261124T120000Z'))

    def test_reschedule_keeps_uid_and_increments_sequence(self):
        first = self.feed([EVENT])
        changed = {**EVENT, 'start':'2027-01-06T09:30:00-08:00', 'date':'2027-01-06'}
        second = self.feed([changed], first, '20261124T120000Z')
        block = read_events(second)['demo-2027@example.test']
        self.assertIn('SEQUENCE:1', block)
        self.assertIn('DTSTART:20270106T173000Z', block)
        self.assertIn('LAST-MODIFIED:20261124T120000Z', block)

    def test_cancelled_and_removed_events_are_retained(self):
        first = self.feed([EVENT])
        cancelled = self.feed([{**EVENT, 'status':'CANCELLED'}], first)
        self.assertIn('STATUS:CANCELLED', cancelled)
        removed = self.feed([], first)
        self.assertIn('UID:demo-2027@example.test', removed)
        self.assertIn('STATUS:CANCELLED', removed)
        self.assertEqual(removed, self.feed([], removed, '20261124T120000Z'))

    def test_all_day_range_has_exclusive_end(self):
        event = copy.deepcopy(EVENT)
        del event['start']
        event.update(kind='conference', endDate='2027-01-07')
        output = self.feed([event])
        self.assertIn('DTSTART;VALUE=DATE:20270105', output)
        self.assertIn('DTEND;VALUE=DATE:20270108', output)

    def test_utf8_folding_escaping_and_timezone(self):
        output = self.feed([{**EVENT, 'description':'é' * 100 + ';,\\\nhello'}])
        self.assertTrue(all(len(line.encode()) <= 75 for line in output.split('\r\n')))
        unfolded = output.replace('\r\n ', '')
        self.assertIn('DTSTART:20270105T173000Z', unfolded)
        self.assertIn('\\;\\,\\\\\\nhello', unfolded)
        self.assertIn('REFRESH-INTERVAL;VALUE=DURATION:PT12H', output)

if __name__ == '__main__':
    unittest.main()
