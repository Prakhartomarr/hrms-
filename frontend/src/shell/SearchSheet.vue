<script setup lang="ts">
import { ref, watch } from "vue"
import { EmptyState, Sheet } from "@/ui"

const props = defineProps<{ open: boolean; query?: string }>()
const emit = defineEmits<{ (e: "update:open", v: boolean): void }>()
const text = ref(props.query ?? "")
watch(
	() => props.open,
	(open) => open && (text.value = props.query ?? text.value)
)
</script>

<template>
	<Sheet :open="open" title="Search" @update:open="emit('update:open', $event)">
		<label for="sheet-search" class="visually-hidden">Search</label>
		<input
			id="sheet-search"
			v-model="text"
			class="search-input"
			type="search"
			placeholder="Search people, requests and policies"
			autocomplete="off"
		/>
		<EmptyState
			icon="search"
			title="Search is on its way"
			message="Searching people, requests and policies arrives with the people directory. For now, use the sections in the menu."
		/>
	</Sheet>
</template>

<style scoped>
.search-input {
	width: 100%;
	height: var(--control-height);
	padding: 0 var(--space-2);
	border: var(--rule-width) solid var(--color-border-strong);
	border-radius: var(--radius-sm);
	background: var(--color-surface);
	color: var(--color-text);
	font: inherit;
}
</style>
