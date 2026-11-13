DOCTYPES = ("Note",)
ORDER = 1


def validate(doc):
	doc.flags.setdefault("calls", []).append(("c_note_only", None))
