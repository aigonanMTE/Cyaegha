(async () => {
    const startInput = document.getElementById('startDateTimeInput');
    const endInput = document.getElementById('endDateTimeInput');
    const machineButtons = document.querySelectorAll('.game-button[data-reserve-type]');
    const hourMilliseconds = 60 * 60 * 1000;
    const minimumDurationHours = 2;
    const maximumDurationHours = 24;
    const dateRangeStorageKey = 'cygame-reservation-date-range';
    let activeController;
    let detailController;
    let activeMachineDetails;
    const timetableCache = new Map();

    const detailsDialog = document.createElement('dialog');
    detailsDialog.className = 'reservation-details-dialog';
    const dialogHeader = document.createElement('header');
    dialogHeader.className = 'reservation-details-header';
    const dialogHeading = document.createElement('h2');
    const closeDialogButton = document.createElement('button');
    closeDialogButton.className = 'reservation-details-close';
    closeDialogButton.type = 'button';
    closeDialogButton.setAttribute('aria-label', '닫기');
    closeDialogButton.textContent = '×';
    const dialogSummary = document.createElement('p');
    dialogSummary.className = 'reservation-details-summary';
    const hourDateSelect = document.createElement('select');
    hourDateSelect.className = 'reservation-date-select';
    hourDateSelect.setAttribute('aria-label', '시간표 날짜');
    const hourGrid = document.createElement('div');
    hourGrid.className = 'reservation-hour-grid';
    const hourLegend = document.createElement('div');
    hourLegend.className = 'reservation-hour-legend';
    const detailsList = document.createElement('div');
    detailsList.className = 'reservation-details-message';
    dialogHeader.append(dialogHeading, closeDialogButton);
    detailsDialog.append(dialogHeader, dialogSummary, hourDateSelect, hourGrid, hourLegend, detailsList);
    document.body.append(detailsDialog);

    closeDialogButton.addEventListener('click', () => detailsDialog.close());
    detailsDialog.addEventListener('click', (event) => {
        if (event.target === detailsDialog) detailsDialog.close();
    });

    function toInputValue(date){
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        return `${year}-${month}-${day} ${hour}:00`;
    }

    function parseDateTime(value){
        const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):00$/.exec(value.trim());
        if (!match) return null;

        const [, year, month, day, hour] = match;
        const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour));
        if (date.getFullYear() !== Number(year)
            || date.getMonth() !== Number(month) - 1
            || date.getDate() !== Number(day)
            || date.getHours() !== Number(hour)) return null;
        return date;
    }

    function dateKey(date){
        return toInputValue(date).slice(0, 10);
    }

    function persistDateRange(){
        const start = parseDateTime(startInput.value);
        const end = parseDateTime(endInput.value);
        if (!start || !end) return;
        const durationHours = (end - start) / hourMilliseconds;
        if (durationHours < minimumDurationHours || durationHours > maximumDurationHours) return;

        try {
            localStorage.setItem(dateRangeStorageKey, JSON.stringify({
                start: startInput.value,
                end: endInput.value
            }));
        } catch (error) {
            console.warn('날짜 및 시간 선택을 저장하지 못했습니다.', error);
        }
    }

    function restoreDateRange(){
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const defaultEnd = new Date(today);
        defaultEnd.setHours(23);
        startInput.value = toInputValue(today);
        endInput.value = toInputValue(defaultEnd);

        try {
            const savedRange = JSON.parse(localStorage.getItem(dateRangeStorageKey));
            const savedStart = parseDateTime(savedRange?.start || '');
            const savedEnd = parseDateTime(savedRange?.end || '');
            if (!savedStart || !savedEnd) return;
            const durationHours = (savedEnd - savedStart) / hourMilliseconds;
            if (durationHours >= minimumDurationHours
                && durationHours <= maximumDurationHours) {
                startInput.value = toInputValue(savedStart);
                endInput.value = toInputValue(savedEnd);
            }
        } catch (error) {
            console.warn('저장된 날짜 및 시간을 불러오지 못했습니다.', error);
        }
    }

    function syncEndLimits(){
        const start = parseDateTime(startInput.value);
        if (!start) return;

        const minimumEnd = new Date(start.getTime() + minimumDurationHours * hourMilliseconds);
        const maximumEnd = new Date(start.getTime() + maximumDurationHours * hourMilliseconds);
        const end = parseDateTime(endInput.value);
        if (!end) return;
        if (end < minimumEnd) {
            endInput.value = toInputValue(minimumEnd);
        } else if (end > maximumEnd) {
            endInput.value = toInputValue(maximumEnd);
        }
    }

    function machineTypeFor(machineName){
        if (machineName.startsWith('mai DX_')) return 'maimai DX';
        if (machineName.startsWith('Taiko_')) return 'Taiko';
        if (machineName.startsWith('CHUNITHM_')) return 'CHUNITHM';
        if (machineName.startsWith('SDVX VM_')) return 'SDVX_VM';
        if (machineName.startsWith('IIDX LM_')) return 'IIDX_LM';
        if (machineName.startsWith('DDR White_')) return 'DDR';
        if (machineName.startsWith('IIDX_')) return 'IIDX';
        if (machineName.startsWith('popn PPPM_')) return 'popn_PPPM';
        if (machineName.startsWith('jubeat_')) return 'jubeat';
        if (machineName === 'DM_White_01' || machineName === 'GF_White_01') return 'GITADORA';
        if (machineName === 'DM_ARENA' || machineName === 'GF_ARENA') return 'GITADORA_ARENA';
        if (machineName === 'EZ2AC') return 'EZ2AC';
        if (machineName === 'REFLEC BEAT') return 'REFLEC BEAT';
        return null;
    }

    async function fetchTimetable(type, date, signal){
        const query = new URLSearchParams({ type, date });
        const response = await fetch(`/api/reserve/timetable/type?${query}`, { signal });
        if (!response.ok) {
            throw new Error(`시간표 요청 실패 (${type}, ${date}): HTTP ${response.status}`);
        }

        const result = await response.json();
        if (!Array.isArray(result.data?.machines)) {
            throw new Error(`시간표 응답 형식이 올바르지 않습니다 (${type}, ${date}).`);
        }
        return { type, date, timetable: result.data };
    }

    function selectedDates(start, end){
        const dates = [];
        const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        while (day < end) {
            dates.push(dateKey(day));
            day.setDate(day.getDate() + 1);
        }
        return dates;
    }

    function setMachineState(button, state){
        button.classList.remove('available', 'reserved', 'selected-time', 'unavailable');
        button.classList.add(state);
    }

    function initializeMachineButtons(){
        machineButtons.forEach((button) => {
            const nameLabel = document.createElement('span');
            nameLabel.className = 'machine-name-label';
            if (button.classList.contains('vertical')) nameLabel.classList.add('vertical-label');
            while (button.firstChild) nameLabel.append(button.firstChild);

            const durationLabel = document.createElement('span');
            durationLabel.className = 'machine-max-duration';
            durationLabel.textContent = '시간 확인 중';
            button.classList.add('has-max-duration');
            button.replaceChildren(nameLabel, durationLabel);
        });
    }

    function updateMaxDuration(button, hour){
        const durationLabel = button.querySelector('.machine-max-duration');
        if (!durationLabel) return;

        if (!hour) {
            durationLabel.textContent = '시간 정보 없음';
            return;
        }

        if (hour.maintenance || hour.blocked_reason) {
            durationLabel.textContent = '예약 불가';
            return;
        }

        const maxUsableHours = Number(hour.max_usable_hours);
        durationLabel.textContent = Number.isFinite(maxUsableHours)
            ? `최대 ${maxUsableHours}시간`
            : '시간 정보 없음';
    }

    function updateMachineStates(timetables, start, end){
        const timetableMap = new Map(
            timetables.map(({ type, date, timetable }) => [`${type}|${date}`, timetable])
        );

        machineButtons.forEach((button) => {
            const machineName = button.dataset.reserveType;
            const type = machineTypeFor(machineName);
            if (!type) {
                updateMaxDuration(button, null);
                setMachineState(button, 'unavailable');
                return;
            }

            const selectedHours = [];
            for (const cursor = new Date(start); cursor < end; cursor.setHours(cursor.getHours() + 1)) {
                const timetable = timetableMap.get(`${type}|${dateKey(cursor)}`);
                const machine = timetable?.machines.find((item) => item.machine_name === machineName);
                const hour = machine?.hours.find((item) => item.hour === cursor.getHours());
                if (!hour) {
                    selectedHours.push(null);
                } else {
                    selectedHours.push(hour);
                }
            }

            const durationHours = (end - start) / hourMilliseconds;
            const firstHour = selectedHours[0];
            updateMaxDuration(button, firstHour);
            if (!firstHour || selectedHours.some((hour) => !hour)) {
                setMachineState(button, 'unavailable');
                return;
            }

            const hasSelectableTime = selectedHours.some((hour) => hour.selectable && hour.available);
            const hasHardBlock = selectedHours.some((hour) =>
                ['RESERVED', 'TYPE_CAPACITY_FULL', 'CLOSED'].includes(hour.blocked_reason)
            );
            const fullyAvailable = firstHour.selectable
                && firstHour.available
                && firstHour.max_duration_hours >= durationHours
                && firstHour.max_usable_hours >= durationHours
                && selectedHours.every((hour) => hour.available)
                && !hasHardBlock;

            if (fullyAvailable) {
                setMachineState(button, 'available');
            } else if (hasSelectableTime) {
                setMachineState(button, 'selected-time');
            } else if (selectedHours.some((hour) =>
                ['RESERVED', 'TYPE_CAPACITY_FULL'].includes(hour.blocked_reason)
            )) {
                setMachineState(button, 'reserved');
            } else {
                setMachineState(button, 'unavailable');
            }
        });
    }

    function createDetailMessage(message){
        const paragraph = document.createElement('p');
        paragraph.className = 'reservation-details-empty';
        paragraph.textContent = message;
        hourGrid.replaceChildren();
        hourLegend.replaceChildren();
        detailsList.replaceChildren(paragraph);
    }

    function renderMachineHours(machine){
        const cells = machine.hours.map((hour) => {
            const cell = document.createElement('div');
            const isReserved = ['RESERVED', 'TYPE_CAPACITY_FULL'].includes(hour.blocked_reason);
            const isAvailable = hour.available && !hour.maintenance;
            const state = isAvailable ? 'available' : isReserved ? 'reserved' : 'unavailable';
            const stateLabel = isAvailable
                ? hour.selectable
                    ? '예약 가능'
                    : `시간은 비어 있음 (최소 ${minimumDurationHours}시간 예약 시작 불가)`
                : isReserved
                    ? '이미 예약됨'
                    : hour.maintenance
                        ? '점검 시간'
                        : hour.blocked_reason === 'CLOSED'
                            ? '영업 종료'
                            : '예약 불가';
            const maxDuration = Number.isFinite(hour.max_usable_hours)
                ? `최대 연속 ${hour.max_usable_hours}시간`
                : '';

            cell.className = `reservation-hour ${state}`;
            cell.textContent = String(hour.hour);
            cell.title = `${String(hour.hour).padStart(2, '0')}:00~${String(hour.hour + 1).padStart(2, '0')}:00 · ${stateLabel}${maxDuration ? ` · ${maxDuration}` : ''}`;
            cell.setAttribute('aria-label', cell.title);
            return cell;
        });
        hourGrid.replaceChildren(...cells);

        const legendItems = [
            ['available', '예약 가능'],
            ['reserved', '이미 예약됨'],
            ['unavailable', '예약 불가']
        ].map(([state, label]) => {
            const item = document.createElement('span');
            item.className = 'reservation-hour-legend-item';
            const swatch = document.createElement('span');
            swatch.className = `reservation-hour-swatch ${state}`;
            const text = document.createElement('span');
            text.textContent = label;
            item.append(swatch, text);
            return item;
        });
        hourLegend.replaceChildren(...legendItems);
        detailsList.replaceChildren();
    }

    async function loadMachineHours(date){
        if (!activeMachineDetails) return;
        const { type, machineName, signal } = activeMachineDetails;
        const cacheKey = `${type}|${date}`;

        createDetailMessage('시간별 예약 가능 여부를 불러오는 중입니다.');
        try {
            let timetable = timetableCache.get(cacheKey);
            if (!timetable) {
                const result = await fetchTimetable(type, date, signal);
                if (signal.aborted) return;
                timetable = result.timetable;
                timetableCache.set(cacheKey, timetable);
            }

            const machine = timetable.machines.find((item) => item.machine_name === machineName);
            if (!machine) {
                createDetailMessage('해당 기체의 시간표를 찾을 수 없습니다.');
                return;
            }
            renderMachineHours(machine);
        } catch (error) {
            if (error.name !== 'AbortError') {
                createDetailMessage('시간표를 불러오지 못했습니다.');
                console.error('시간표를 불러오지 못했습니다.', error);
            }
        }
    }

    async function showReservations(button){
        const start = parseDateTime(startInput.value);
        const end = parseDateTime(endInput.value);
        if (!start || !end) {
            detailsDialog.showModal();
            createDetailMessage('날짜와 시간을 YYYY-MM-DD HH:00 형식으로 입력해 주세요.');
            return;
        }
        const dates = selectedDates(start, end);
        const machineName = button.dataset.reserveType;
        const machineLabel = button.textContent.replace(/\s+/g, ' ').trim();
        const type = machineTypeFor(machineName);

        detailController?.abort();
        detailController = new AbortController();
        const signal = detailController.signal;
        activeMachineDetails = { type, machineName, signal };
        dialogHeading.textContent = `${machineLabel} 예약 가능 시간`;
        dialogSummary.textContent = dates.length === 1
            ? `${dates[0]} · 시간별 예약 가능 여부`
            : `${dates[0]} ~ ${dates[dates.length - 1]}`;
        hourDateSelect.replaceChildren(...dates.map((date) => {
            const option = document.createElement('option');
            option.value = date;
            option.textContent = date;
            return option;
        }));
        hourDateSelect.value = dateKey(start);
        hourDateSelect.hidden = dates.length <= 1;

        if (!type) {
            createDetailMessage('이 기체의 시간표 API 타입을 확인할 수 없습니다.');
            if (!detailsDialog.open) detailsDialog.showModal();
            return;
        }

        createDetailMessage('시간별 예약 가능 여부를 불러오는 중입니다.');
        if (!detailsDialog.open) detailsDialog.showModal();
        await loadMachineHours(hourDateSelect.value);
    }

    hourDateSelect.addEventListener('change', () => loadMachineHours(hourDateSelect.value));

    async function refreshTimetables(){
        syncEndLimits();
        if (!startInput.value || !endInput.value) return;

        const start = parseDateTime(startInput.value);
        const end = parseDateTime(endInput.value);
        if (!start || !end) return;
        const durationHours = (end - start) / hourMilliseconds;
        if (durationHours < minimumDurationHours || durationHours > maximumDurationHours) return;

        activeController?.abort();
        activeController = new AbortController();
        const { signal } = activeController;
        const dates = selectedDates(start, end);
        const types = [...new Set([...machineButtons]
            .map((button) => machineTypeFor(button.dataset.reserveType))
            .filter(Boolean))];

        try {
            const timetables = await Promise.all(
                types.flatMap((type) => dates.map((date) => fetchTimetable(type, date, signal)))
            );
            if (!signal.aborted) {
                timetables.forEach(({ type, date, timetable }) => {
                    timetableCache.set(`${type}|${date}`, timetable);
                });
                updateMachineStates(timetables, start, end);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('예약 시간표를 불러오지 못했습니다.', error);
            }
        }
    }

    startInput.addEventListener('input', () => {
        syncEndLimits();
        persistDateRange();
    });
    endInput.addEventListener('input', persistDateRange);
    startInput.addEventListener('change', refreshTimetables);
    endInput.addEventListener('change', refreshTimetables);
    machineButtons.forEach((button) => {
        button.setAttribute('aria-haspopup', 'dialog');
        button.addEventListener('click', () => showReservations(button));
    });
    initializeMachineButtons();
    restoreDateRange();
    syncEndLimits();
    persistDateRange();
    refreshTimetables();
})().catch((error) => {
    console.error('예약 시간표를 불러오지 못했습니다.', error);
});