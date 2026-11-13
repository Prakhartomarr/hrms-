<script setup lang="ts">
/**
 * Placeholder Today sheet (T03). First viewport per the "Working papers" contract:
 * date line and greeting, the punch entry, ruled balances with ticks and footnotes,
 * pending items as unticked lines. Real data arrives with T30, T43 and T51.
 */
import { computed, ref } from "vue"
import { session } from "@/data/session"
import { formatDateLong, formatNumber, formatTime, greeting } from "@/lib/format"
import { Footnote, Highlight, PageActions, RuledLine, RuledList, Stamp } from "@/ui"
import { SAMPLE_BALANCES, SAMPLE_PENDING } from "./sample"

const now = new Date()
const firstName = computed(
	() => session.context?.employee?.first_name || session.context?.user.first_name || ""
)
const place = computed(() => session.context?.employee?.branch || "Location not captured")

// Preview only: the stamp shows what a punch will leave, nothing is saved yet.
const punchedAt = ref<Date | null>(null)
function punch() {
	punchedAt.value = new Date()
}
</script>

<template>
	<article class="today">
		<header class="today__head">
			<p class="today__date">
				<time :datetime="now.toISOString().slice(0, 10)">{{ formatDateLong(now) }}</time>
			</p>
			<h1 class="today__greeting">{{ greeting(now) }}, {{ firstName }}</h1>
		</header>

		<section class="today__punch" aria-labelledby="punch-title">
			<h2 id="punch-title" class="visually-hidden">Check in</h2>
			<template v-if="punchedAt">
				<Stamp label="Checked in" :time="formatTime(punchedAt)" :place="place" />
				<p class="today__hint">Preview only, not saved. Check-in goes live with the attendance release.</p>
			</template>
			<template v-else>
				<PageActions class="today__punch-action" :primary="{ label: 'Check in', icon: 'log-in', onClick: punch }" />
				<p class="today__hint">General shift, 9:30 am to 6:30 pm. Not checked in yet.</p>
			</template>
		</section>

		<RuledList title="Leave balances" note="Sample figures">
			<RuledLine
				v-for="(b, i) in SAMPLE_BALANCES"
				:key="b.label"
				:label="b.label"
				:figure="formatNumber(b.days, 2)"
				unit="days"
				done
			>
				<template #note>
					<Footnote :n="i + 1" :label="`How ${b.label.toLowerCase()} was worked out`">
						<dl class="working">
							<template v-for="w in b.working" :key="w.text">
								<dt>{{ w.text }}</dt>
								<dd class="num">{{ w.figure }}</dd>
							</template>
							<dt class="working__total">Balance</dt>
							<dd class="working__total num">{{ formatNumber(b.days, 2) }}</dd>
						</dl>
					</Footnote>
				</template>
			</RuledLine>
		</RuledList>

		<RuledList title="Waiting on you" note="Sample items">
			<RuledLine v-for="p in SAMPLE_PENDING" :key="p.label" :detail="p.detail">
				<Highlight v-if="p.needsYou">{{ p.label }}</Highlight>
				<template v-else>{{ p.label }}</template>
			</RuledLine>
		</RuledList>
	</article>
</template>

<style scoped>
.today {
	max-width: 640px;
}
.today__date {
	color: var(--color-text-muted);
	font-size: var(--text-sm);
	line-height: var(--text-sm-lh);
	font-weight: var(--weight-medium);
}
.today__greeting {
	margin-top: var(--space-half);
	font-size: var(--text-2xl);
	line-height: var(--text-2xl-lh);
	font-weight: var(--weight-bold);
	letter-spacing: -0.01em;
}
.today__punch {
	margin-top: var(--space-3);
}
.today__punch-action {
	margin-top: 0;
	flex-direction: column;
}
.today__punch-action :deep(.ui-button) {
	width: 100%;
	min-height: var(--space-6);
	font-size: var(--text-lg);
}
.today__hint {
	margin-top: var(--space-1);
	color: var(--color-text-muted);
	font-size: var(--text-sm);
	line-height: var(--text-sm-lh);
}
.working {
	display: grid;
	grid-template-columns: 1fr auto;
	column-gap: var(--space-2);
	row-gap: var(--space-half);
	margin: 0;
	width: 100%;
}
.working dt,
.working dd {
	margin: 0;
}
.working dd {
	text-align: right;
	color: var(--color-text);
}
.working__total {
	padding-top: var(--space-half);
	border-top: var(--rule-width) solid var(--color-rule);
	font-weight: var(--weight-semibold);
	color: var(--color-text);
}
@media (min-width: 900px) {
	.today__greeting {
		font-size: var(--text-3xl);
		line-height: var(--text-3xl-lh);
	}
}
</style>
