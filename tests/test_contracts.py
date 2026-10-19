import copy
import json
from pathlib import Path
import subprocess
import unittest
from contracts.validate import validate, validate_pair
ROOT=Path(__file__).resolve().parents[1]
class ContractTests(unittest.TestCase):
    def test_shared_fixtures_and_typescript_agreement(self):
        fixtures=json.loads((ROOT/'tests/fixtures.json').read_text())
        pairs=json.loads((ROOT/'tests/pairs.json').read_text())
        results=[]
        for f in fixtures:
            with self.subTest(fixture=f['name']):
                before=copy.deepcopy(f['value'])
                result=validate(f['kind'],f['value'])
                self.assertEqual(result,f['expected'])
                self.assertEqual(before,f['value'])
                results.append(result)
        pair_results=[]
        for p in pairs:
            with self.subTest(pair=p['name']):
                result=validate_pair(p['decision'],p['outcome'])
                self.assertEqual(result,p['expected'])
                pair_results.append(result)
        ts=json.loads(subprocess.check_output(['node','tests/check_ts.cjs','--json'],cwd=ROOT,text=True))
        self.assertEqual(results,ts['results'])
        self.assertEqual(pair_results,ts['pairResults'])
        print(f'GATE PASS: Python and TypeScript agree on {len(fixtures)} fixtures and {len(pairs)} event pairs (simulated).')
if __name__=='__main__':unittest.main()
