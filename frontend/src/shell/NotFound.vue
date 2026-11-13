<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import { EmptyState, PageHeader } from "@/ui"
import { NAV_ITEMS, isActive } from "./nav"

// A nav section whose page hasn't shipped yet gets a calm "coming soon"; anything else is a 404.
const route = useRoute()
const section = computed(() => NAV_ITEMS.find((i) => i.path !== "/" && isActive(i, route.path)))
</script>

<template>
	<div>
		<template v-if="section">
			<PageHeader :title="section.label" />
			<EmptyState
				:icon="section.icon"
				:title="`${section.label} is coming soon`"
				message="This part of GAMCS HR is being built. Until then, you can use the Frappe HR app for it."
				:action="{ label: 'Back to today', to: '/' }"
			/>
		</template>
		<template v-else>
			<PageHeader title="Page not found" />
			<EmptyState
				icon="map"
				title="We couldn't find that page"
				message="The link may be old or mistyped."
				:action="{ label: 'Back to today', to: '/' }"
			/>
		</template>
	</div>
</template>
