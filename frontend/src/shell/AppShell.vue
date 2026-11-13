<script setup lang="ts">
import AppHeader from "./AppHeader.vue"
import BottomNav from "./BottomNav.vue"
import SideNav from "./SideNav.vue"
</script>

<template>
	<div class="shell">
		<a class="shell__skip" href="#main">Skip to content</a>
		<SideNav class="shell__side" />
		<div class="shell__column">
			<AppHeader />
			<main id="main" class="shell__main" tabindex="-1">
				<div class="shell__content"><slot /></div>
			</main>
		</div>
		<BottomNav class="shell__bottom" />
	</div>
</template>

<style scoped>
.shell {
	min-height: 100dvh;
}
.shell__skip {
	position: absolute;
	left: var(--space-2);
	top: -100px;
	z-index: 50;
	padding: var(--space-1) var(--space-2);
	background: var(--color-surface);
	border: var(--rule-width) solid var(--color-rule-strong);
}
.shell__skip:focus {
	top: var(--space-1);
}
.shell__main {
	outline: none;
	padding: var(--space-3) var(--space-2) calc(var(--bottom-nav-height) + var(--space-4) + env(safe-area-inset-bottom));
}
.shell__content {
	max-width: var(--content-max);
	margin: 0 auto;
}
.shell__side {
	display: none;
}
@media (min-width: 900px) {
	.shell {
		display: grid;
		grid-template-columns: var(--side-nav-width) 1fr;
	}
	.shell__side {
		display: flex;
	}
	.shell__bottom {
		display: none;
	}
	.shell__main {
		padding: var(--space-4) var(--space-4) var(--space-8);
	}
}
</style>
