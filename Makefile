test:
	expresso test/test.js

clean:
	rm -r test/data/world
	rm -r test/output
	rm test/data/.*.xml

.PHONY: clean test
