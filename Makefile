test:
	expresso test/test.js

clean:
	rm -r test/data/29578fe9eb8e576fb55121faa390f3a7*
	rm -r test/output
	rm test/data/.*.xml

.PHONY: clean test
