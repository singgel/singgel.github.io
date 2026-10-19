.PHONY: test test-coverage serve

test:
	python3 scripts/version_assets.py --check
	node --check assets/app.js
	node --check assets/bookmarks.js
	node --check assets/socials.js
	node --check assets/growth.js
	node --test tests/*.test.cjs
	python3 -m unittest discover -s tests -p 'test_*.py'

test-coverage:
	node --test --experimental-test-coverage --test-coverage-include='assets/*.js' --test-coverage-lines=50 tests/*.test.cjs

serve:
	python3 -m http.server 8080
