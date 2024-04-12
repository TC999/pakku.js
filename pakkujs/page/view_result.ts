import {Egress} from "../protocol/interface";

let tabid = parseInt(new URLSearchParams(location.search).get('tabid') || '0');
let $content = document.querySelector('#content') as HTMLElement;
let $ingress = document.querySelector('#ingress') as HTMLElement;
let $download = document.querySelector('#download') as HTMLElement;

let options: {[k: string]: string} = {};
for(let input of document.querySelectorAll('input[type=radio]:checked') as NodeListOf<HTMLInputElement>) {
    options[input.name] = input.value;
}

function download(filename: string, text: string) {
    let a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], {type: 'application/octet-stream; charset=utf-8'}));
    a.download = filename;
    a.click();
}

async function process() {
    let egress: Egress = options.egress==='xml' ? {type: 'xml'} : options.egress==='debug' ? {type: 'debug', show_peers: false} : {type: 'debug', show_peers: true};

    let dumped_result = await chrome.tabs.sendMessage(tabid, {
        type: 'dump_result',
        egress: egress,
        switch: options.step==='output',
    });
    console.log(dumped_result);

    if(typeof dumped_result.error === 'string') {
        $content.textContent = dumped_result.error;
        return;
    }

    $ingress.textContent = JSON.stringify(dumped_result.ingress);
    $content.textContent = dumped_result.text;

    $download.onclick = ()=>{
        let ext = options.egress==='xml' ? 'xml' : 'js';
        let cid = (dumped_result as any).ingress.cid || 'content';
        download(`${cid}.${ext}`, dumped_result.text);
    };
}

void process();
for(let input of document.querySelectorAll('input[type=radio]') as NodeListOf<HTMLInputElement>) {
    input.addEventListener('change', (e)=>{
        let target = e.target as HTMLInputElement;
        options[target.name] = target.value;
        void process();
    });
}