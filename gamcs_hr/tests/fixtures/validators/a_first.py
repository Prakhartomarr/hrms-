ORDER = 10


def validate(doc):
	doc.flags.setdefault("calls", []).append(("a_first", "_assignment" in doc.__dict__))
