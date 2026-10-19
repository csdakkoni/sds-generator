import unittest
from parse_cesio import cas_valid, parse_cas_cell, parse_carbon_chain, parse_concentration, parse_eo_po


class ParseTests(unittest.TestCase):
    def test_cas_check_digit(self):
        self.assertTrue(cas_valid('68439-57-6'))
        self.assertFalse(cas_valid('68439-57-7'))

    def test_cas_cell_variants(self):
        self.assertEqual(parse_cas_cell('68439-57-6')['cas'], '68439-57-6')
        both = parse_cas_cell('160901-19-9 (66455-14-9)')
        self.assertEqual(both['cas'], '160901-19-9')
        self.assertEqual(both['cas_alternates'], ['66455-14-9'])
        several = parse_cas_cell('68439-45-2 71060-57-6')
        self.assertIsNone(several['cas'])
        self.assertEqual(len(several['cas_list']), 2)
        self.assertIsNone(parse_cas_cell('not yet assigned')['cas'])
        self.assertEqual(parse_cas_cell('68439-57-7')['cas_invalid'], ['68439-57-7'])

    def test_carbon_chain(self):
        self.assertEqual(parse_carbon_chain('12-14'), (12, 14))
        self.assertEqual(parse_carbon_chain('C18 unsat.'), (18, 18))
        self.assertEqual(parse_carbon_chain(None), (None, None))

    def test_eo_po_keeps_operators(self):
        self.assertEqual(parse_eo_po('≥ 2.5 - < 4 EO'),
                         {'min': 2.5, 'min_op': '≥', 'max': 4.0, 'max_op': '<'})
        self.assertEqual(parse_eo_po('< 2.5 EO')['max_op'], '<')
        self.assertEqual(parse_eo_po('> 50 EO')['min_op'], '>')
        self.assertEqual(parse_eo_po('15 EO')['min'], 15.0)
        self.assertIsNone(parse_eo_po('not relevant'))

    def test_concentration_ranges_stay_ranges(self):
        self.assertEqual(parse_concentration('5 < C ≤ 38'),
                         {'min': 5.0, 'min_op': '>', 'max': 38.0, 'max_op': '≤'})
        self.assertEqual(parse_concentration('≥ 20%')['min_op'], '≥')
        self.assertEqual(parse_concentration('95****')['min'], 95.0)
        self.assertIsNone(parse_concentration(None))


if __name__ == '__main__':
    unittest.main()
