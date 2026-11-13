<script setup lang="ts">
import { computed } from "vue"
import feather from "feather-icons"

// Decorative by default (aria-hidden). Pass `label` when the icon carries meaning alone.
const props = withDefaults(defineProps<{ name: string; size?: number; label?: string }>(), {
	size: 20,
})

const svg = computed(() => {
	const icon = (feather.icons as Record<string, { toSvg: (a: object) => string }>)[props.name]
	return icon
		? icon.toSvg({ width: props.size, height: props.size, "stroke-width": 2, "aria-hidden": "true" })
		: ""
})
</script>

<template>
	<span
		class="ui-icon"
		:role="label ? 'img' : undefined"
		:aria-label="label"
		:aria-hidden="label ? undefined : 'true'"
		v-html="svg"
	/>
</template>

<style scoped>
.ui-icon {
	display: inline-flex;
	flex: none;
	line-height: 0;
}
</style>
