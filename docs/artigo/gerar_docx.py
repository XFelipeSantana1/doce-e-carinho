"""Exporta o artigo e o prompt locais para DOCX sem dependências externas.

O conteúdo acadêmico fica nos arquivos Markdown. O formato é provisório,
pois não foi fornecido um modelo institucional da ETEC.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'
XML = 'http://www.w3.org/XML/1998/namespace'
ET.register_namespace('w', W)
ET.register_namespace('r', R)

def el(name, attrs=None, text=None):
    node = ET.Element('{%s}%s' % (W, name))
    for key, val in (attrs or {}).items():
        node.set('{%s}%s' % (W, key), str(val))
    if text is not None:
        node.text = text
    return node

def xml(node):
    return ET.tostring(node, encoding='utf-8', xml_declaration=True)

def run(text, bold=False):
    node=el('r')
    if bold:
        props=el('rPr'); props.append(el('b')); node.append(props)
    value=el('t', text=text); value.set('{%s}space' % XML, 'preserve'); node.append(value)
    return node

def styles():
    root=el('styles')
    defaults=el('docDefaults')
    rdef=el('rPrDefault'); rp=el('rPr'); rp.append(el('rFonts',{'ascii':'Times New Roman','hAnsi':'Times New Roman','eastAsia':'Times New Roman','cs':'Times New Roman'})); rp.append(el('sz',{'val':24})); rp.append(el('lang',{'val':'pt-BR'})); rdef.append(rp); defaults.append(rdef); root.append(defaults)
    specs=[('Normal',None,'both',False,24,360,0,709),('Institution','Normal','center',False,20,240,40,0),('Title','Normal','center',True,28,280,200,0),('Author','Normal','center',False,22,240,30,0),('Heading1','Normal','left',True,24,240,120,0),('Heading2','Heading1','left',True,24,240,100,0),('Abstract','Normal','both',False,24,240,120,0),('Keywords','Abstract','left',False,24,240,160,0),('Reference','Normal','left',False,24,240,180,0),('Prompt','Normal','left',False,22,270,100,0)]
    for ident, base, align, bold, size, line, after, indent in specs:
        s=el('style',{'type':'paragraph','styleId':ident})
        if ident=='Normal': s.set('{%s}default'%W,'1')
        s.append(el('name',{'val':ident}))
        if base:s.append(el('basedOn',{'val':base}))
        pp=el('pPr'); pp.append(el('jc',{'val':align}));pp.append(el('spacing',{'line':line,'lineRule':'auto','after':after,'before':160 if ident.startswith('Heading') else 0}));pp.append(el('ind',{'firstLine':indent}));pp.append(el('widowControl'))
        if ident in ['Title','Heading1','Heading2']:pp.append(el('keepNext'));pp.append(el('keepLines'))
        if ident=='Heading1':pp.append(el('outlineLvl',{'val':0}))
        if ident=='Heading2':pp.append(el('outlineLvl',{'val':1}))
        s.append(pp);rp=el('rPr');rp.append(el('sz',{'val':size}));rp.append(el('color',{'val':'000000'}))
        if bold:rp.append(el('b'))
        s.append(rp);root.append(s)
    return root

def generate(source, dest, prompt=False):
    text=source.read_text(encoding='utf-8')
    doc=el('document');body=el('body');doc.append(body)
    rels=ET.Element('Relationships',{'xmlns':PKG})
    ET.SubElement(rels,'Relationship',{'Id':'rIdStyles','Type':R+'/styles','Target':'styles.xml'})
    ET.SubElement(rels,'Relationship',{'Id':'rIdFooter','Type':R+'/footer','Target':'footer1.xml'})
    links={}
    def add_text(p, text):
        parts=re.split(r'(https?://[^\s]+)',text)
        for part in parts:
            if part.startswith(('http://','https://')):
                url=part.rstrip('.,;')
                if url not in links:
                    ident='rIdLink'+str(len(links)+1);links[url]=ident
                    ET.SubElement(rels,'Relationship',{'Id':ident,'Type':R+'/hyperlink','Target':url,'TargetMode':'External'})
                h=el('hyperlink');h.set('{%s}id'%R,links[url]);h.append(run(url));p.append(h)
                if url!=part:p.append(run(part[len(url):]))
            elif part:
                for index, chunk in enumerate(re.split(r'\*\*(.*?)\*\*',part)):
                    if chunk:p.append(run(chunk.replace('`',''),bold=index%2==1))
    in_abstract=False; in_refs=False; title_seen=False; body_started=False
    for block in text.split('\n\n'):
        block=block.strip()
        if not block or block=='---':continue
        if block.startswith('```'): # O prompt não tem blocos de código; tratamento de compatibilidade.
            block='\n'.join(block.splitlines()[1:-1])
        ident='Prompt' if prompt else 'Normal'
        if block.startswith('# '):
            ident='Title';block=block[2:];title_seen=True
        elif block.startswith('## '):
            ident='Heading1';block=block[3:];in_abstract=block in ['Resumo','Abstract'];in_refs=block=='Referências';body_started=True
        elif block.startswith('### '):
            ident='Heading2';block=block[4:]
        elif not prompt and not body_started:
            ident='Author' if title_seen else 'Institution'
        elif not prompt and block.startswith(('Palavras-chave:','Keywords:')):ident='Keywords'
        elif not prompt and in_abstract:ident='Abstract'
        elif not prompt and in_refs:ident='Reference'
        p=el('p');props=el('pPr');props.append(el('pStyle',{'val':ident}))
        if in_abstract and block and not block.startswith(('Resumo','Abstract','Palavras-chave:','Keywords:')):
            rp=el('rPr');rp.append(el('lang',{'val':'en-US' if 'Managing orders' in block else 'pt-BR'}));props.append(rp)
        p.append(props)
        for i,line in enumerate(block.splitlines()):
            if i:
                r=el('r');r.append(el('br'));p.append(r)
            add_text(p,line)
        body.append(p)
    sec=el('sectPr');footer_ref=el('footerReference',{'type':'default'});footer_ref.set('{%s}id'%R,'rIdFooter');sec.append(footer_ref)
    sec.append(el('pgSz',{'w':11906,'h':16838}));sec.append(el('pgMar',{'top':1701,'right':1134,'bottom':1134,'left':1701,'header':567,'footer':567,'gutter':0}));body.append(sec)
    footer=el('ftr');p=el('p');pp=el('pPr');pp.append(el('jc',{'val':'center'}));p.append(pp);field=el('fldSimple',{'instr':' PAGE '});field.append(run('1'));p.append(field);footer.append(p)
    content_types='''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>'''
    package_rels='''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'''
    core=ET.Element('cp:coreProperties',{'xmlns:cp':'http://schemas.openxmlformats.org/package/2006/metadata/core-properties','xmlns:dc':'http://purl.org/dc/elements/1.1/'})
    ET.SubElement(core,'dc:title').text='Prompt de revisão do artigo' if prompt else 'Doce e Carinho como sistema integrado de gestão de estoque e vendas para confeitaria artesanal'
    ET.SubElement(core,'dc:creator').text='Arthur Zaia Paes; Felipe Santana de Oliveira; Ismael Ribeiro de Morais Netto'
    ET.SubElement(core,'dc:language').text='pt-BR'
    app='''<?xml version="1.0" encoding="UTF-8"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Doce e Carinho — exportação OOXML</Application></Properties>'''
    with ZipFile(dest,'w',ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml',content_types);z.writestr('_rels/.rels',package_rels)
        z.writestr('word/document.xml',xml(doc));z.writestr('word/styles.xml',xml(styles()));z.writestr('word/footer1.xml',xml(footer));z.writestr('word/_rels/document.xml.rels',ET.tostring(rels,encoding='utf-8',xml_declaration=True));z.writestr('docProps/core.xml',ET.tostring(core,encoding='utf-8',xml_declaration=True));z.writestr('docProps/app.xml',app)
    with ZipFile(dest) as z:
        assert z.testzip() is None
        for name in z.namelist():
            if name.endswith(('.xml','.rels')):ET.fromstring(z.read(name))
        contents=''.join(ET.fromstring(z.read('word/document.xml')).itertext())
        if not prompt:
            for item in ['Resumo','Abstract','Palavras-chave:','Keywords:','1 Introdução','2 Desenvolvimento','3 Considerações finais','Referências','Arthur Zaia Paes','Felipe Santana de Oliveira','Ismael Ribeiro de Morais Netto']:
                assert item in contents,item
        assert 'AQ.Ab8' not in contents and 'GEMINI_API_KEY=A' not in contents
    print(f'Gerado e validado estruturalmente: {dest.name}')

if __name__=='__main__':
    generate(ROOT/'ARTIGO_ATUALIZADO.md',ROOT/'Artigo_Doce_e_Carinho_Arthur_Felipe_Ismael_1a_versao.docx')
    generate(ROOT/'PROMPT_REVISAO_ARTIGO_TCC.md',ROOT/'Prompt_revisao_artigo_Doce_e_Carinho.docx',prompt=True)
    article=(ROOT/'ARTIGO_ATUALIZADO.md').read_text()
    for title, end in [('Resumo','Palavras-chave:'),('Abstract','Keywords:')]:
        part=article.split('## '+title+'\n\n',1)[1].split(end,1)[0].strip()
        count=len(part.split());assert 150<=count<=250,(title,count)
        print(f'{title}: {count} palavras')
