from gamcs_hr.framework.validators import ValidatorPipeline


class ToDoExtension(ValidatorPipeline):
	validator_packages = ("gamcs_hr.tests.fixtures.validators",)
