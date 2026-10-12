.PHONY: test test-coverage serve

test:
	node --check assets/app.js
	node --test tests/*.test.cjs

test-coverage:
	node --test --experimental-test-coverage --test-coverage-include='assets/*.js' --test-coverage-lines=50 tests/*.test.cjs

serve:
	python3 -m http.server 8080
