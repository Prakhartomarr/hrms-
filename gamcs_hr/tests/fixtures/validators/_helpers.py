def validate(doc):  # underscore files are helpers, never rules
	raise AssertionError("helpers must not be discovered")
