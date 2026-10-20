#!/usr/bin/env python3
"""Real scripts + fake releases/ADB/Android commands. Never connects to a device."""
import ast
import json
import os
from pathlib import Path
import shlex
import shutil
import signal
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]

class Installer(unittest.TestCase):
    def run_install(self, mode, target='all', trial=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            shutil.copytree(ROOT/'optimize', root/'optimize', ignore=shutil.ignore_patterns('venv','adbkey','run','__pycache__','*.apk','.tv_host'))
            shutil.copytree(ROOT/'config', root/'config')
            binary = root/'bin'; binary.mkdir()
            curl = binary/'curl'
            curl.write_text('''#!/usr/bin/env python3
import os,sys,zipfile
from pathlib import Path
with open(os.environ['CALL_LOG'],'a') as f:f.write('DOWNLOAD '+sys.argv[-1]+'\\n')
mode=os.environ['CASE']
if mode=='missing' or (mode=='second_missing' and sys.argv[-1].endswith('urtv-home.apk')):sys.exit(22)
p=Path(sys.argv[sys.argv.index('-o')+1])
if mode=='bad_zip':p.write_text('not an APK')
else:
 with zipfile.ZipFile(p,'w') as z:z.writestr('AndroidManifest.xml',b'fixture')
''')
            fake = binary/'fake-adb'
            fake.write_text('''#!/usr/bin/env python3
import os,sys
from pathlib import Path
args=sys.argv[1:]; cmd=args[-1]; mode=os.environ['CASE']
with open(os.environ['CALL_LOG'],'a') as f:f.write('ADB '+repr(args)+'\\n')
if '--push-b64' in args:sys.exit(0)
if ' capture' in cmd:print('vendor.home/vendor.home.Start');sys.exit(0)
if 'pm install -r' in cmd:
 print('Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]' if mode=='signature' else 'Failure [INSTALL_FAILED_VERSION_DOWNGRADE]' if mode=='downgrade' else 'Success');sys.exit(0)
if ' arm ' in cmd and mode=='arm_fail':sys.exit(1)
if ' status ' in cmd:
 if mode in ('guard_dead','disconnect'):sys.exit(71)
 if '&&' in cmd and mode=='reboot':sys.exit(1)
 if '&&' in cmd:
  with open(os.environ['CALL_LOG'],'a') as f:f.write('EFFECT SET_HOME\\n')
print('')
''')
            sleep = binary/'sleep'; sleep.write_text('#!/bin/sh\nexit 0\n')
            for f in (curl,fake,sleep):f.chmod(0o755)
            log=root/'calls'
            env={**os.environ,'PATH':str(binary)+os.pathsep+os.environ['PATH'],'PY':str(fake),'CASE':mode,'CALL_LOG':str(log)}
            args=['bash','optimize/install.sh',target]+(['--trial-home'] if trial else [])
            r=subprocess.run(args,cwd=root,env=env,text=True,capture_output=True,timeout=15)
            return r, log.read_text() if log.exists() else ''
    def test_missing_or_corrupt_release_stops_before_any_adb(self):
        for mode in ('missing','second_missing','bad_zip'):
            with self.subTest(mode=mode):
                r,log=self.run_install(mode)
                self.assertNotEqual(r.returncode,0,r.stdout+r.stderr);self.assertNotIn('ADB ',log)
    def test_signing_failure_never_uninstalls_or_changes_home(self):
        r,log=self.run_install('signature')
        self.assertNotEqual(r.returncode,0);self.assertNotIn('EFFECT SET_HOME',log)
        self.assertNotIn('uninstall',log);self.assertNotIn('pm clear',log)
    def test_default_preview_retains_default_home(self):
        r,log=self.run_install('ok');self.assertEqual(r.returncode,0,r.stdout+r.stderr)
        self.assertNotIn('set-home-activity',log);self.assertNotIn('disable-user',log)
        self.assertLess(log.rindex('DOWNLOAD '),log.index('ADB '))
    def test_guard_failure_connection_loss_or_reboot_prevent_home_switch(self):
        for mode in ('arm_fail','guard_dead','disconnect','reboot'):
            with self.subTest(mode=mode):
                r,log=self.run_install(mode,'launcher',True)
                self.assertNotEqual(r.returncode,0,r.stdout+r.stderr)
                self.assertNotIn('EFFECT SET_HOME',log);self.assertNotIn('disable-user',log)
    def test_trial_keeps_watchdog_armed_and_stock_enabled(self):
        r,log=self.run_install('ok','launcher',True)
        self.assertEqual(r.returncode,0,r.stdout+r.stderr)
        self.assertIn('EFFECT SET_HOME',log);self.assertIn('NOT reboot-safe',r.stderr)
        self.assertNotIn('disable-user',log);self.assertNotIn('home_ok',log);self.assertNotIn(' restore',log)

class HomeGuard(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.state=self.root/'state';self.bin=self.root/'bin';self.bin.mkdir()
        self.original='vendor.tcl.home/vendor.tcl.home.Start'
        (self.root/'home').write_text(self.original)
        (self.root/'foreground').write_text(self.original)
        (self.root/'boot').write_text('boot-one')
        command=self.bin/'android-command'
        command.write_text('''#!/usr/bin/env python3
import os,sys
from pathlib import Path
r=Path(os.environ['FIXTURE']);name=Path(sys.argv[0]).name;a=sys.argv[1:]
with (r/'commands').open('a') as f:f.write(name+' '+' '.join(a)+'\\n')
if (r/'disconnect').exists():sys.exit(70)
if name=='cat':
 if a==['/proc/sys/kernel/random/boot_id']:print((r/'boot').read_text())
 else:os.execv('/bin/cat',['cat']+a)
elif name=='sleep':
 import time;time.sleep(0.005)
elif name=='pm':
 if a[0]=='path':print('package:/system/original.apk')
elif name=='cmd':
 if 'resolve-activity' in a:print((r/'home').read_text())
 elif 'set-home-activity' in a:
  if (r/'fail-count').exists() and int((r/'fail-count').read_text())>0:
   (r/'fail-count').write_text(str(int((r/'fail-count').read_text())-1));print('Error: temporary rejection')
  elif (r/'fail').exists():print('Error: firmware rejected Home') # Android may return zero with error text
  else:(r/'home').write_text(a[-1])
elif name=='am':
 if not (r/'fail').exists():(r/'foreground').write_text(a[-1]+('Extra' if (r/'wrong-activity').exists() else ''))
elif name=='dumpsys':print('mResumedActivity: ActivityRecord{fixture u0 '+(r/'foreground').read_text()+'}')
elif name=='settings':
 f=r/('secure-'+a[2])
 if a[0]=='get':print(f.read_text() if f.exists() else 'null')
 elif a[0]=='delete':f.unlink(missing_ok=True)
 elif a[0]=='put':f.write_text(a[3])
''');command.chmod(0o755)
        for name in ('cmd','pm','am','input','dumpsys','settings','cat','sleep'):(self.bin/name).symlink_to(command)
        self.env={**os.environ,'PATH':str(self.bin)+os.pathsep+os.environ['PATH'],'FIXTURE':str(self.root),
                  'URTV_HOME_STATE':str(self.state),'URTV_HOME_HELPER':str(ROOT/'optimize/home-guard.sh')}
        self.worker=None
    def tearDown(self):
        if self.worker:
            try:os.kill(self.worker,signal.SIGTERM)
            except ProcessLookupError:pass
        self.tmp.cleanup()
    def run_guard(self,*args):
        return subprocess.run(['sh',str(ROOT/'optimize/home-guard.sh'),*args],env=self.env,capture_output=True,text=True,timeout=15)
    def capture(self):
        r=self.run_guard('capture');self.assertEqual(r.returncode,0,r.stdout+r.stderr)
    def fake_ready(self,boot='boot-one'):
        self.state.mkdir(exist_ok=True)
        (self.state/'ready').write_text('a'*32+f' {os.getpid()} {boot}\n')
    def test_capture_records_actual_non_google_component_and_refuses_guessing(self):
        r=self.run_guard('restore');self.assertNotEqual(r.returncode,0)
        self.capture();self.assertEqual((self.state/'original').read_text().strip(),self.original)
        self.assertNotIn('launcherx',(self.root/'commands').read_text())
    def test_restore_failure_keeps_guard_armed(self):
        self.capture();self.fake_ready();(self.root/'home').write_text('sa.urtv.home/sa.urtv.home.MainActivity')
        (self.root/'foreground').write_text('sa.urtv.home/sa.urtv.home.MainActivity');(self.root/'fail').touch()
        r=self.run_guard('restore');self.assertNotEqual(r.returncode,0,r.stdout+r.stderr)
        self.assertTrue((self.state/'ready').exists());self.assertFalse((self.state/'restored').exists())
    def test_disconnect_cannot_disarm_recovery(self):
        self.capture();self.fake_ready();(self.root/'disconnect').touch()
        r=self.run_guard('restore');self.assertNotEqual(r.returncode,0)
        self.assertTrue((self.state/'ready').exists());self.assertFalse((self.state/'restored').exists())
    def test_similar_activity_name_cannot_confirm_restore(self):
        self.capture();self.fake_ready();(self.root/'wrong-activity').touch()
        result=self.run_guard('restore')
        self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertTrue((self.state/'ready').exists());self.assertFalse((self.state/'restored').exists())
    def test_successful_restore_verifies_before_disarm_and_preserves_apps(self):
        (self.root/'secure-screensaver_components').write_text('vendor.saver/.Dream')
        self.capture();self.fake_ready();(self.root/'home').write_text('sa.urtv.home/sa.urtv.home.MainActivity')
        r=self.run_guard('restore');self.assertEqual(r.returncode,0,r.stdout+r.stderr)
        self.assertTrue((self.state/'restored').exists());self.assertFalse((self.state/'ready').exists())
        log=(self.root/'commands').read_text();self.assertGreaterEqual(log.count('dumpsys activity'),2)
        self.assertNotIn('uninstall',log);self.assertNotIn('clear',log);self.assertNotIn('disable',log)
        (self.root/'secure-screensaver_components').write_text('sa.urtv.screensaver/.ScreenDream')
        r=self.run_guard('restore-saver');self.assertEqual(r.returncode,0,r.stdout+r.stderr)
        self.assertEqual((self.root/'secure-screensaver_components').read_text(),'vendor.saver/.Dream')
    def test_reboot_invalidates_stale_ready_even_when_pid_is_alive(self):
        self.capture();token='a'*32
        self.assertEqual(self.run_guard('arm',token).returncode,0)
        for _ in range(100):
            if (self.state/'ready').exists():break
            time.sleep(.01)
        self.worker=int((self.state/'ready').read_text().split()[1])
        self.assertEqual(self.run_guard('status',token).returncode,0)
        (self.root/'boot').write_text('boot-two')
        self.assertNotEqual(self.run_guard('status',token).returncode,0)
        self.assertTrue((self.state/'original').exists())
    def test_real_worker_acknowledges_and_restores_without_host_connection(self):
        self.capture();token='b'*32
        r=self.run_guard('arm',token);self.assertEqual(r.returncode,0,r.stdout+r.stderr)
        for _ in range(100):
            if (self.state/'ready').exists():break
            time.sleep(.01)
        self.assertTrue((self.state/'ready').exists());self.worker=int((self.state/'ready').read_text().split()[1])
        self.assertEqual(self.run_guard('status',token).returncode,0)
        r=self.run_guard('restore');self.assertEqual(r.returncode,0,r.stdout+r.stderr)
    def test_dead_worker_is_not_a_valid_guard(self):
        self.capture();(self.state/'ready').write_text('c'*32+' 99999999 boot-one\n')
        self.assertNotEqual(self.run_guard('status','c'*32).returncode,0)

    def test_watchdog_timeout_retries_failed_restore_without_host(self):
        self.capture()
        (self.root/'home').write_text('sa.urtv.home/sa.urtv.home.MainActivity')
        (self.root/'foreground').write_text('sa.urtv.home/sa.urtv.home.MainActivity')
        (self.root/'fail-count').write_text('1')
        # Accelerate only the waiting threshold in a disposable copy; run real retry/restore logic.
        helper=self.root/'fast-guard.sh'
        helper.write_text((ROOT/'optimize/home-guard.sh').read_text().replace('"$i" -lt 300','"$i" -lt 0'))
        self.env['URTV_HOME_HELPER']=str(helper)
        result=subprocess.run(['sh',str(helper),'watch','d'*32,'boot-one'],env=self.env,capture_output=True,text=True,timeout=15)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertGreaterEqual((self.root/'commands').read_text().count('set-home-activity'),2)
        self.assertTrue((self.state/'restored').exists());self.assertFalse((self.state/'ready').exists())

class CheckedTransport(unittest.TestCase):
    def test_exit_status_missing_reply_and_shell_quoting(self):
        tree=ast.parse((ROOT/'optimize/tv.py').read_text())
        method=next(n for c in tree.body if isinstance(c,ast.ClassDef) and c.name=='TV' for n in c.body if isinstance(n,ast.FunctionDef) and n.name=='checked')
        ns={'shlex':shlex};exec(compile(ast.Module(body=[method],type_ignores=[]),'checked','exec'),ns)
        class Remote:
            def shell(self,cmd):return subprocess.check_output(cmd,shell=True,text=True)
        self.assertEqual(ns['checked'](Remote(),"printf '%s' 'literal $HOME `echo secret`'"),'literal $HOME `echo secret`')
        with self.assertRaises(RuntimeError):ns['checked'](Remote(),'exit 7')
        class Disconnected:
            def shell(self,cmd):return 'partial reply'
        with self.assertRaises(RuntimeError):ns['checked'](Disconnected(),'true')

if __name__=='__main__':unittest.main(verbosity=2)
