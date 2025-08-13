import {url_finder} from "../protocol/urls";
import {BADGE_ERR_JS, handle_proto_view, handle_task, scheduler} from "../core/scheduler";
import {remove_state} from "../background/state";
import {AjaxResponse, BlacklistItem, int, LocalizedConfig, MessageStats} from "../core/types";
import {process_local, userscript_sandbox} from "./sandboxed";
import {ProtobufIngressSeg, ProtobufView} from "../protocol/interface_protobuf";

function get_player_blacklist(): BlacklistItem[] {
    type BlockListType = {
        type: 0 | 1 | 2; // 0 text (case insensitive), 1 regexp (case sensitive), 2 user
        filter: string;
        opened: boolean;
        id: int;
    }[];
    type BpxProfileType = {
        blockList: BlockListType
        dmSetting: {
            status: boolean;
        };
    };
    try {
        let j = JSON.parse(window.localStorage.getItem('bpx_player_profile')!) as BpxProfileType;
        if(!j) // possibly in another domain
            j = {
                blockList: [],
                dmSetting: {status: false},
            };
        if(!j.dmSetting.status) // blacklist disabled
            j.blockList = [];

        let extra = JSON.parse(window.localStorage.getItem('pakku_extra_blacklist') || '[]') as BlockListType;
        j.blockList.push(...extra);

        let ret = (
            j.blockList
                .filter(item=>item.opened && [0, 1].includes(item.type))
                .map(item=>[item.type===1, item.filter] as BlacklistItem)
                .filter(item=>{
                    if(item[0]) {
                        try {
                            new RegExp(item[1]);
                        } catch(e) {
                            return false;
                        }
                    }
                    return true;
                })
        );
        console.log('pakku injected: got player blacklist', ret);
        return ret;
    } catch(e) {
        console.error('pakku injected: cannot get player blacklist', e);
        return [];
    }
}

let tabid: null | int = null;
let local_config: null | LocalizedConfig = null;
let unreg_userscript = true;

function _really_get_local_config(is_pure_env: boolean): Promise<{tabid: int, local_config: LocalizedConfig}> {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            type: 'get_local_config',
            is_pure_env: is_pure_env,
        }, (res)=>{
            if(res.error) {
                reject('in background script: '+res.error);
            } else {
                resolve(res.result);
            }
        });
    });
}

async function get_local_config(is_pure_env: boolean = false): Promise<LocalizedConfig> {
    if(!local_config) {
        ({tabid, local_config} = await _really_get_local_config(is_pure_env));

        local_config.BLACKLIST = local_config.BLACKLIST.length ? get_player_blacklist() : [];

        if(localStorage.getItem('pakku_extra_userscript'))
            local_config.USERSCRIPT = local_config.USERSCRIPT + '\n\n' + localStorage.getItem('pakku_extra_userscript');

        // storage cleanup
        window.onbeforeunload = function() {
            if(unreg_userscript)
                void remove_state([`STATS_${tabid}`, `USERSCRIPT_${tabid}`]);
            else
                void remove_state([`STATS_${tabid}`]);

            // in case of page refresh: clear the badge
            try {
                chrome.runtime.sendMessage({type: 'update_badge', tabid: tabid, text: null})
                    .catch(()=>{});
            } catch(e) {}
        };
    }
    return local_config;
}

void get_local_config();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if(msg.type==='ping') {
        sendResponse({error: null});
    }
    else if(msg.type==='refresh') {
        unreg_userscript = false;
        window.location.reload();
    }
    else if(msg.type==='dump_result') {
        let s = scheduler;
        if(!s) {
            sendResponse({
                error: '当前标签没有弹幕处理结果',
            });
        } else {
            let resp: AjaxResponse = s.dump_result(msg.step, msg.egress);
            if(!resp)
                    sendResponse({
                        error: `处理结果为 ${resp}`,
                    });
            else if(typeof resp.data === 'string')
                try {
                    sendResponse({
                        error: null,
                        text: resp.data,
                        ingress: s!.ingress,
                    });
                } catch(e) {
                    alert(`无法传输弹幕处理结果：\n${(e as Error).message}`);
                }
            else
                sendResponse({
                    error: `处理结果为 ${resp.data.constructor.name}`,
                });
        }
    }
    else if(msg.type==='reload_danmu') {
        local_config = null;
        if(window.reload_danmu_magic)
            window.reload_danmu_magic(msg.key);
    }
    else {
        console.log('pakku injected: unknown chrome message', msg.type);
    }
});

function is_bilibili(origin: string): boolean {
    return origin.endsWith('.bilibili.com') || origin.endsWith('//bilibili.com');
}

let ext_domain = chrome.runtime.getURL('');
if(ext_domain.endsWith('/'))
    ext_domain = ext_domain.slice(0, -1);

function is_proto_view(x: any): x is [ProtobufIngressSeg, ProtobufView] {
    // ts is too weak to inference this, let's add a type guard to teach it
    return x[1].type==='proto_view';
}

window.addEventListener('message', async function(event) {
    if(is_bilibili(event.origin) && event.data.type=='pakku_ping') {
        event.source!.postMessage({
            type: 'pakku_pong',
        }, event.origin as any);
    }
    else if(is_bilibili(event.origin) && event.data.type=='pakku_ajax_request') {
        console.log('pakku injected: got ajax request', event.data.url);
        let sendResponse = (resp: AjaxResponse) => {
            event.source!.postMessage({
                type: 'pakku_ajax_response',
                url: event.data.url,
                resp: resp,
            }, event.origin as any);
        };

        url_finder.protoapi_img_url = window.localStorage.getItem('wbi_img_url');
        url_finder.protoapi_sub_url = window.localStorage.getItem('wbi_sub_url');

        let url = url_finder.find(event.data.url);
        if(!url) {
            console.log('pakku injected: url not matched:', event.data.url);
            sendResponse(null);
            return;
        }

        if(!local_config) {
            try {
                local_config = await get_local_config();
            } catch(e: any) {
                console.error('pakku injected: cannot get local config', e);
                if(tabid) {
                    let msg = `读取配置时出错\n${e.message || e}\n\nStacktrace:\n${e.stack || '(null)'}\n\nIngress:\n${JSON.stringify(url[0])}`;
                    new MessageStats('error', BADGE_ERR_JS, msg).notify(tabid);
                }

                sendResponse(null);
                return;
            }
        }

        if(
            !local_config.GLOBAL_SWITCH &&
            !(url[0].type==='proto_seg' && url[0].is_magicreload) // still process magic reload requests to avoid HTTP 400
        ) {
            console.log('pakku injected: SKIPPED because global switch off');
            sendResponse(null);
            return;
        }

        if(is_proto_view(url)) {
            handle_proto_view(url[0], event.data.url, local_config, tabid!)
                .then((ab)=>{
                    sendResponse({
                        data: new Uint8Array(ab),
                    });
                });
            return;
        }

        handle_task(url[0], url[1], sendResponse, local_config, tabid!);
    }
    else if(event.origin===ext_domain && event.data.type==='pakku_userscript_sandbox_request') {
        let res = await userscript_sandbox(event.data.script);
        event.source!.postMessage({
            type: 'pakku_userscript_sandbox_result',
            result: res,
        }, event.origin as any);
    }
    else if(event.origin===ext_domain && event.data.type==='pakku_process_local_request') {
        let config = await get_local_config(true);
        config.GLOBAL_SWITCH = true;

        let res = await process_local(event.data.ingress, event.data.egress, config, tabid!);
        event.source!.postMessage({
            type: 'pakku_process_local_result',
            result: res,
        }, event.origin as any);
    }
},false);