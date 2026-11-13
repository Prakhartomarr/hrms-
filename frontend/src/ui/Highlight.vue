<script setup lang="ts">
// The highlighter stroke: Signal Yellow, used on the ONE item that needs the person.
// The marked text is always Midnight ink on yellow (about 10:1), in light and dark.
</script>

<template>
	<mark class="ui-highlight"><slot /></mark>
</template>

<style scoped>
.ui-highlight {
	color: var(--color-on-accent);
	background: linear-gradient(
		transparent 8%,
		var(--color-highlight) 8%,
		var(--color-highlight) 94%,
		transparent 94%
	);
	padding: 0 0.15em;
	margin: 0 -0.15em;
	-webkit-box-decoration-break: clone;
	box-decoration-break: clone;
}
</style>
