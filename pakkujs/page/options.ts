import {Config, DEFAULT_CONFIG, fix_invalid_keys, get_config, migrate_config, save_config} from '../background/config';
import Permissions = chrome.permissions.Permissions;

const IS_FIREFOX = process.env.PAKKU_CHANNEL==='firefox';
const IS_EDG = process.env.PAKKU_CHANNEL==='edg';
const MIN_CHROME_VERSION = 99; // callback for chrome.runtime.sendMessage

let note_container = id('note-banner-container');
function show_note(key: string, text: string | null, link: string | (()=>void) | null) {
    let old_note = id('note-'+key);
    if(old_note)
        old_note.remove();

    if(text===null)
        return;

    let note = document.createElement('a');
    note.id = 'note-' + key;
    note.textContent = text;

    if(typeof link === 'function') {
        note.addEventListener('click', link);
        note.href = '#';
    } else if(typeof link === 'string') {
        note.href = link;
        note.target = '_blank';
        note.rel = 'noopener';
    }

    note_container.appendChild(note);
}

if(!IS_FIREFOX && navigator.userAgent.includes('Firefox/'))
    show_note(
        'wrong_channel',
        '你正在使用 Chrome 分支的 pakku，它在 Firefox 中无法正常工作。\nFirefox 用户请点击前往 Firefox 附加组件中心下载 pakku，然后卸载此版本。',
        'https://addons.mozilla.org/zh-CN/firefox/addon/pakkujs/',
    );

function id(x: string): any {
    return document.getElementById(x);
}

function try_regexp(x: string) {
    try {
        new RegExp(x);
        return x;
    } catch(e) {
        alert('正则表达式语法有误：\n\n' + (e as Error).message)
        throw e;
    }
}

function regexp_wrap(src: string) {
    if(!src.startsWith('^'))
        src = '^.*' + src;
    if(!src.endsWith('$'))
        src = src + '.*$';
    return src;
}

let version = 'v' + chrome.runtime.getManifest().version;
let img_btns: NodeListOf<HTMLElement> = document.querySelectorAll('[data-name]');
id('version').textContent = version + '_' + (IS_FIREFOX ? 'F' : IS_EDG ? 'E' : 'C');

function highlighter() {
    if(!location.hash) return;
    let el = document.querySelector(location.hash);
    if(!el) return;

    let adv_obj = el.closest('.advanced');
    if(adv_obj) {
        adv_obj.classList.add('js-show-this');
        let next_warning = adv_obj.nextElementSibling;
        if(next_warning && next_warning.classList.contains('advanced') && next_warning.classList.contains('warning'))
            next_warning.classList.add('js-show-this');
    }

    el = el.closest('p');
    if(!el) return;

    let old = document.getElementById('highlighter');
    if(old) old.remove();

    let hl = document.createElement('span');
    hl.id = 'highlighter';
    el.appendChild(hl);

    el.scrollIntoView();
    setTimeout(function() {
        scrollBy(0, -100);
    }, 0);
}

highlighter();
window.addEventListener('hashchange', highlighter);

id('reset').addEventListener('click', function() {
    if(confirm('确定要重置所有设置吗？\n此操作不可恢复。')) {
        localStorage.clear();
        chrome.storage.sync.clear(function() {
            if(chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                alert('设置清空失败');
            }

            void chrome.runtime.sendMessage({type: 'reset_dnr_status'});
            alert('重置完成');
            location.reload();
        });
    }
});

let ask_review_link = id('ask-review-link');
if(IS_FIREFOX) {
    ask_review_link.href = 'https://addons.mozilla.org/zh-CN/firefox/addon/pakkujs/reviews/';
    ask_review_link.textContent = 'Mozilla Add-ons 网站';
}
if(IS_EDG) {
    ask_review_link.href = 'https://microsoftedge.microsoft.com/addons/detail/pakku%EF%BC%9A%E5%93%94%E5%93%A9%E5%93%94%E5%93%A9%E5%BC%B9%E5%B9%95%E8%BF%87%E6%BB%A4%E5%99%A8/lnfcfeidnipnphibahlkdhalpkpmccoc';
    ask_review_link.textContent = 'Microsoft Edge 加载项网站';
}

// version check
async function ver_check() {
    let chrome_ver_match = navigator.userAgent.match(/Chrome\/(\d+)/);
    let chrome_ver = chrome_ver_match ? parseInt(chrome_ver_match[1]) : null;

    if(process.env.PAKKU_CHANNEL!=='firefox' && chrome_ver && chrome_ver<MIN_CHROME_VERSION) {
        show_note(
            'browser_version',
            `你的浏览器内核版本太低（实为 ${chrome_ver}，需要 ≥${MIN_CHROME_VERSION}），部分功能不可用。请更新浏览器。`,
            'https://www.google.cn/chrome/',
        );
    }

    if(IS_EDG) {
        console.log('version checking disabled for edg');
        return;
    }

    let res = await fetch(
        IS_FIREFOX ?
            'https://img.shields.io/amo/v/pakkujs.json' :
            'https://img.shields.io/chrome-web-store/v/jklfcpboamajpiikgkbjcnnnnooefbhh.json',
    );
    let latest_ver = await res.json();

    console.log('latest version ', latest_ver);
    if(latest_ver.value.charAt(0) === 'v') {
        if(latest_ver.value !== version) {
            let update_url = 'https://s.xmcp.ltd/pakkujs/?src=update_banner&from_version=' + encodeURIComponent(version);
            show_note(
                'pakku_version',
                `你正在使用 pakku ${version}，${latest_ver.name} 中的最新版是 ${latest_ver.value}。点击此处下载新版本。`,
                update_url,
            );

            // let the browser to auto update
            if(chrome.runtime.requestUpdateCheck) {
                chrome.runtime.requestUpdateCheck((status, details)=>{
                    console.log('request update check ', status, details);
                    if(status === 'update_available')
                        show_note(
                            'pakku_version',
                            `你正在使用 pakku ${version}。重启浏览器来自动更新到 ${details?.version || '新版本'}，或者点击此处手动下载。`,
                            update_url,
                        );
                });
            }
        }  else {
            id('version-checker').textContent = '✓ 是最新版本';
        }
    }
}
void ver_check();

for(let elem of document.querySelectorAll('.donate')) {
    elem.addEventListener('mouseover', function() {
        document.body.classList.add('donate-show');
    });
    elem.addEventListener('mouseout', function() {
        document.body.classList.remove('donate-show');
    });
}

function get_perms(): Promise<Permissions> {
    return new Promise((resolve)=>{
        chrome.permissions.getAll(resolve);
    });
}

let config: Config;
try {
    config = await get_config();
} catch(e: any) {
    show_note(
        'get_config',
        `无法读取配置，浏览器存在故障：${e.message || e}`,
        null,
    );
    throw e;
}

let perms = await get_perms();

if(!perms.origins?.includes('*://*.bilibili.com/*')) {
    show_note(
        'permission',
        '需要授权 pakku 访问 bilibili.com 才能正常工作，点击授予权限。',
        function() {
            // xxx: cannot use async here, https://bugzilla.mozilla.org/show_bug.cgi?id=1398833
            chrome.permissions.request({
                origins: ['*://*.bilibili.com/*', 'ws://*.bilibili.com/*', 'wss://*.bilibili.com/*'],
            })
                .then((granted)=>{
                    if(granted) {
                        show_note('permission', null, null);
                        void chrome.runtime.sendMessage({type: 'reset_dnr_status'});
                        void chrome.notifications.clear('//perm_hotfix');
                        chrome.permissions.getAll().then((p)=>{perms = p;});
                    }
                });
        },
    );
}

function get_ws_permission_and_reload() {
    function done(granted: boolean) {
        if(!granted) {
            config.BREAK_UPDATE = false;
            // noinspection ES6MissingAwait
            alert('权限不足或者您的浏览器不支持此功能');
        }
        void reload(true);
    }

    if(perms.origins?.includes('ws://*.bilibili.com/*') && perms.origins?.includes('wss://*.bilibili.com/*')) {
        done(true);
    } else {
        chrome.permissions.request({
            origins: ['ws://*.bilibili.com/*', 'wss://*.bilibili.com/*'],
        }, (granted)=>{
            done(granted);
        });
    }
}

async function try_save_config(config: Config) {
    let error_msg = await save_config(config);

    if(error_msg) {
        show_note('save_config', error_msg, null);
    }
    return error_msg;
}

async function backup_restore_prompt() {
    let inp = prompt('直接按回车来导出设置；将设置粘贴到此处来导入设置。');
    if(inp === null) return;
    if(!inp) { // export
        document.body.textContent = JSON.stringify(config);
        document.body.style.wordBreak = 'break-all';
        document.body.style.fontFamily = 'Consolas, Courier, monospace';
        document.body.style.padding = '.5em';
        alert('导出成功。\n请将屏幕上的文本妥善保存在别处。');
    } else { // import
        try {
            config = JSON.parse(inp);
            config._CONFIG_VER = config._CONFIG_VER || 0;
            config = migrate_config(config);
            fix_invalid_keys(config);

            let err = await try_save_config(config);
            loadconfig();

            if(config.BREAK_UPDATE)
                get_ws_permission_and_reload();
            else
                void chrome.runtime.sendMessage({type: 'reset_dnr_status'});

            alert(err || '导入成功。');
            setTimeout(()=>{
                location.reload();
            }, 200);
        } catch(e) {
            alert('导入失败。\n\n' + (e as Error).message);
            throw e;
        }
    }
}

id('version').addEventListener('click', async function(event: MouseEvent) {
    if(event.altKey && event.ctrlKey)
        await backup_restore_prompt();
});
id('backup-restore').addEventListener('click', backup_restore_prompt);

for(let elem of document.querySelectorAll('a[data-help-text]') as NodeListOf<HTMLElement>) {
    let txt = elem.dataset['helpText']!.replace(/\\n/g, '\n');
    elem.onclick = ()=>{
        alert(txt);
    };
}

async function reload(changed_dnr=false) {
    let err = await try_save_config(config);

    if(!err) {
        id('saved-alert').classList.remove('saved-hidden');
        setTimeout(function() {
            id('saved-alert').classList.add('saved-hidden');
        }, 100);
    }

    let old = document.getElementById('highlighter');
    if(old) old.remove();

    if(changed_dnr)
        void chrome.runtime.sendMessage({type: 'reset_dnr_status'});

    loadconfig();
}

function _other_onchange(e: Event) {
    let elem = e.target as HTMLSelectElement;
    if(elem.value === '_other') {
        let more_opt: HTMLOptionElement = elem.querySelector('option.other')!;

        let val = prompt('输入自定义数值：') || '';
        more_opt.value = val;
        elem.value = val;
    }
}

function set_select_value(elem: HTMLSelectElement, value: number, ui_pfx = '', ui_sfx = '') {
    value = Math.round(value);

    let exact_opt: HTMLOptionElement|null = elem.querySelector(`option:not(.other)[value="${value}"]`);
    let more_opt: HTMLOptionElement = elem.querySelector('option.other')!;

    if(exact_opt) {
        more_opt.value = '_other';
        more_opt.textContent = '自定义…';
        more_opt.style.display = config.ADVANCED_USER ? 'initial' : 'none';
        elem.addEventListener('change', _other_onchange, {capture: true});
    } else {
        more_opt.value = ''+value;
        more_opt.textContent = `自定义 (${ui_pfx}${value}${ui_sfx})`;
        more_opt.style.display = 'initial';
        elem.removeEventListener('change', _other_onchange, {capture: true});
    }

    elem.value = ''+value;
}

function loadconfig() {
    id('show-advanced').checked = config.ADVANCED_USER;
    // 弹幕合并
    id('threshold').value = config.THRESHOLD;
    set_select_value(id('max-dist'), config.MAX_DIST, '≤', '');
    set_select_value(id('max-cosine'), config.MAX_COSINE, '', '%');
    id('trim-pinyin').checked = config.TRIM_PINYIN;
    id('trim-ending').checked = config.TRIM_ENDING;
    id('trim-space').checked = config.TRIM_SPACE;
    id('trim-width').checked = config.TRIM_WIDTH;
    // 例外设置
    id('cross-mode').checked = config.CROSS_MODE;
    id('ignore-type7').checked = !config.PROC_TYPE7;
    id('ignore-type4').checked = !config.PROC_TYPE4;
    id('ignore-pool1').checked = !config.PROC_POOL1;
    // 显示设置
    id('danmu-mark').value = config.DANMU_MARK;
    id('mark-threshold').value = config.MARK_THRESHOLD;
    id('danmu-subscript').checked = config.DANMU_SUBSCRIPT;
    id('enlarge').checked = config.ENLARGE;
    set_select_value(id('shrink-threshold'), config.SHRINK_THRESHOLD, '>', '');
    set_select_value(id('drop-threshold'), config.DROP_THRESHOLD, '>', '');
    id('mode-elevation').checked = config.MODE_ELEVATION;
    set_select_value(id('representative-percent'), config.REPRESENTATIVE_PERCENT, '', '%');
    // 播放器增强
    id('tooltip').checked = config.TOOLTIP;
    id('tooltip-keybinding').checked = config.TOOLTIP_KEYBINDING;
    id('auto-disable-danmu').checked = config.AUTO_DISABLE_DANMU;
    id('auto-danmu-list').checked = config.AUTO_DANMU_LIST;
    id('fluctlight').checked = config.FLUCTLIGHT;
    // 实验室
    id('break-update').checked = config.BREAK_UPDATE;
    id('takeover-aijudge').checked = config.TAKEOVER_AIJUDGE;
    id('scroll-threshold').value = config.SCROLL_THRESHOLD;
    // 其他
    id('popup-badge').value = config.POPUP_BADGE;
    id('combine-threads').value = config.COMBINE_THREADS;
    id('read-player-blacklist').checked = config.READ_PLAYER_BLACKLIST;

    // advanced options
    if(id('show-advanced').checked) document.body.classList.add('i-am-advanced');
    else document.body.classList.remove('i-am-advanced');
    // opacity stuff
    id('mark-threshold-panel').style.opacity = '' + (config.DANMU_MARK ? 1 : .3);
    id('danmu-subscript-panel').style.opacity = '' + (config.DANMU_MARK ? 1 : .3);
    id('tooltip-keybinding-panel').style.opacity = '' + (config.TOOLTIP ? 1 : .3);

    // FORCELIST
    let forcelist = id('forcelist');
    forcelist.textContent = '';
    for(let i_str in config.FORCELIST) {
        let i = parseInt(i_str);

        let container = document.createElement('li'),
            code1 = document.createElement('code'),
            spliter = document.createElement('span'),
            code2 = document.createElement('code'),
            deletebtn = document.createElement('button'),
            savebtn = document.createElement('button'),
            cancelbtn = document.createElement('button');

        code1.textContent = config.FORCELIST[i][0];
        code1.contentEditable = 'true';
        spliter.textContent = ' → ';
        code2.textContent = config.FORCELIST[i][1];
        code2.contentEditable = 'true';

        deletebtn.textContent = '删除';
        deletebtn.className = 'btn';
        cancelbtn.textContent = '取消';
        cancelbtn.className = 'btn hidden';
        savebtn.textContent = '保存';
        savebtn.className = 'btn hidden';

        deletebtn.addEventListener('click', async function() {
            config.FORCELIST.splice(i, 1);
            await reload();
        });
        savebtn.addEventListener('click', async function() {
            config.FORCELIST[i][0] = try_regexp(code1.textContent!);
            config.FORCELIST[i][1] = code2.textContent!;
            await reload();
        });
        cancelbtn.addEventListener('click', loadconfig);

        let show_btn = ()=>{
            deletebtn.classList.add('hidden');
            savebtn.classList.remove('hidden');
            cancelbtn.classList.remove('hidden');
        };
        let handle_enter = (e: KeyboardEvent)=>{
            if(e.key === 'Enter') {
                e.preventDefault();
                savebtn.click();
            }
        };

        code1.addEventListener('input', show_btn);
        code2.addEventListener('input', show_btn);
        code1.addEventListener('keypress', handle_enter);
        code2.addEventListener('keypress', handle_enter);

        container.appendChild(code1);
        container.appendChild(spliter);
        container.appendChild(code2);
        container.appendChild(deletebtn);
        container.appendChild(cancelbtn);
        container.appendChild(savebtn);
        forcelist.appendChild(container);
    }

    // WHITELIST
    let whitelist = id('whitelist');
    whitelist.textContent = '';
    for(let i_str in config.WHITELIST) {
        let i = parseInt(i_str);

        let container = document.createElement('li'),
            code1 = document.createElement('code'),
            deletebtn = document.createElement('button'),
            savebtn = document.createElement('button'),
            cancelbtn = document.createElement('button');

        code1.textContent = config.WHITELIST[i][0];
        code1.contentEditable = 'true';

        deletebtn.textContent = '删除';
        deletebtn.className = 'btn';
        savebtn.textContent = '保存';
        savebtn.className = 'btn hidden';
        cancelbtn.textContent = '取消';
        cancelbtn.className = 'btn hidden';

        deletebtn.addEventListener('click', async function() {
            config.WHITELIST.splice(i, 1);
            await reload();
        });
        savebtn.addEventListener('click', async function() {
            config.WHITELIST[i][0] = try_regexp(code1.textContent!);
            await reload();
        });
        cancelbtn.addEventListener('click', loadconfig);

        let show_btn = ()=>{
            savebtn.classList.remove('hidden');
            cancelbtn.classList.remove('hidden');
        };

        code1.addEventListener('input', show_btn);

        container.appendChild(code1);
        container.appendChild(deletebtn);
        container.appendChild(savebtn);
        container.appendChild(cancelbtn);
        whitelist.appendChild(container);
    }

    function stringify(s: string | number | boolean) {
        if(typeof s === 'boolean')
            return s ? 'on' : 'off';
        else
            return '' + s;
    }

    for(let elem of img_btns) {
        let v = elem.dataset['value']!;
        let negated = false;
        if(v.startsWith('!')) {
            v = v.slice(1);
            negated = true;
        }

        let target = stringify((config as any)[elem.dataset['name']!]);
        if(negated ? (target !== v) : (target === v))
            elem.className = 'img-active';
        else
            elem.className = 'img-inactive';
        }
}

id('newforcelist-form').addEventListener('submit', function(e: Event) {
    e.preventDefault();
    config.FORCELIST.push([
        try_regexp(regexp_wrap(id('newforcelist-pattern').value)),
        id('newforcelist-name').value,
    ]);
    void reload();
    id('newforcelist-pattern').value = '';
    id('newforcelist-name').value = '';
});
id('newwhitelist-form').addEventListener('submit', function(e: Event) {
    e.preventDefault();
    config.WHITELIST.push([
        try_regexp(id('newwhitelist-pattern').value),
        "", // could be anything
    ]);
    void reload();
    id('newwhitelist-pattern').value = '';
});
for(let elem of img_btns) {
    elem.addEventListener('click', function() {
        (config as any)[elem.dataset['name']!] = elem.dataset['value'];
        void reload();
    });
}

function safe_int(x: string, min: number | null, max: number | null, fallback: number) {
    let v = parseInt(x, 10);
    if(isNaN(v) || (min!==null && v<min) || (max!==null && v>max)) {
        alert(`数值无效（${x}），已恢复为默认`);
        return fallback;
    }
    else
        return v;
}

function update(this: HTMLInputElement) {
    config.ADVANCED_USER = id('show-advanced').checked;
    // 弹幕合并
    config.THRESHOLD = safe_int(id('threshold').value, -1, 180, DEFAULT_CONFIG.THRESHOLD);
    config.MAX_DIST = safe_int(id('max-dist').value, 0, null, DEFAULT_CONFIG.MAX_DIST);
    config.MAX_COSINE = safe_int(id('max-cosine').value, 0, null, DEFAULT_CONFIG.MAX_COSINE);
    config.TRIM_PINYIN = id('trim-pinyin').checked;
    config.TRIM_ENDING = id('trim-ending').checked;
    config.TRIM_SPACE = id('trim-space').checked;
    config.TRIM_WIDTH = id('trim-width').checked;
    // 例外设置
    config.CROSS_MODE = id('cross-mode').checked;
    config.PROC_TYPE7 = !id('ignore-type7').checked;
    config.PROC_TYPE4 = !id('ignore-type4').checked;
    config.PROC_POOL1 = !id('ignore-pool1').checked;
    // 显示设置
    config.DANMU_MARK = id('danmu-mark').value;
    config.MARK_THRESHOLD = safe_int(id('mark-threshold').value, 1, null, DEFAULT_CONFIG.MARK_THRESHOLD);
    config.DANMU_SUBSCRIPT = id('danmu-subscript').checked;
    config.ENLARGE = id('enlarge').checked;
    config.SHRINK_THRESHOLD = safe_int(id('shrink-threshold').value, 0, null, DEFAULT_CONFIG.SHRINK_THRESHOLD);
    config.DROP_THRESHOLD = safe_int(id('drop-threshold').value, 0, null, DEFAULT_CONFIG.DROP_THRESHOLD);
    config.MODE_ELEVATION = id('mode-elevation').checked;
    config.REPRESENTATIVE_PERCENT = safe_int(id('representative-percent').value, 0, 100, DEFAULT_CONFIG.REPRESENTATIVE_PERCENT);
    // 播放器增强
    config.TOOLTIP = id('tooltip').checked;
    config.TOOLTIP_KEYBINDING = id('tooltip-keybinding').checked;
    config.AUTO_DISABLE_DANMU = id('auto-disable-danmu').checked;
    config.AUTO_DANMU_LIST = id('auto-danmu-list').checked;
    config.FLUCTLIGHT = id('fluctlight').checked;
    // 实验室
    config.BREAK_UPDATE = id('break-update').checked;
    config.TAKEOVER_AIJUDGE = id('takeover-aijudge').checked;
    config.SCROLL_THRESHOLD = safe_int(id('scroll-threshold').value, 0, null, DEFAULT_CONFIG.SCROLL_THRESHOLD);
    // 其他
    config.POPUP_BADGE = id('popup-badge').value;
    config.COMBINE_THREADS = safe_int(id('combine-threads').value, 0, null, DEFAULT_CONFIG.COMBINE_THREADS);
    config.READ_PLAYER_BLACKLIST = id('read-player-blacklist').checked;

    if(this.id === 'break-update') {
        if(this.checked)
            get_ws_permission_and_reload();
        else
            void reload(true);
    }
    else {
        void reload();
    }
}

loadconfig();

for(let elem of [
    'show-advanced',
    // 弹幕合并
    'threshold', 'max-dist', 'max-cosine', 'trim-pinyin', 'trim-ending', 'trim-space', 'trim-width',
    // 例外设置
    'cross-mode', 'ignore-type7', 'ignore-type4', 'ignore-pool1',
    // 显示设置
    'mark-threshold', 'danmu-mark', 'danmu-subscript', 'enlarge', 'shrink-threshold', 'drop-threshold', 'mode-elevation', 'representative-percent',
    // 播放器增强
    'tooltip', 'tooltip-keybinding', 'auto-disable-danmu', 'auto-danmu-list', 'fluctlight',
    // 实验室
    'break-update', 'takeover-aijudge', 'scroll-threshold',
    // 其他
    'popup-badge', 'combine-threads', 'read-player-blacklist',
]) {
    id(elem).addEventListener('change', update);
}