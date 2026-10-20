#!/usr/bin/env python3
"""Execute production Java release validation/storage against real temp files, no Android/keys."""
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
JAVA=ROOT/'android/app/src/main/java/sa/urtv/screensaver'

class StableContent(unittest.TestCase):
    def test_policy_and_transactional_rollback(self):
        harness=r'''
package sa.urtv.screensaver;
import java.io.*;
import java.nio.file.Files;
public final class ContentHarness {
 static int checks;
 static void check(boolean ok,String what) {if(!ok)throw new AssertionError(what);checks++;}
 interface Action {void run() throws Exception;}
 static void rejects(Action a,String what)throws Exception {try{a.run();}catch(IOException e){checks++;return;}throw new AssertionError(what);}
 static File dir;
 static ContentStore store()throws Exception{return new ContentStore(dir);}
 static byte[] bytes(String text)throws Exception{return text.getBytes("UTF-8");}
 static String sha(byte[] b)throws Exception{return ContentPolicy.digest(b);}
 public static void main(String[] a)throws Exception {
  byte[] page=Files.readAllBytes(new File(a[1]).toPath());String digest=sha(page);
  ContentPolicy.descriptor(1,1,1,1,1,2,1,"a".repeat(40),digest,page.length);checks++;
  ContentPolicy.verify(page,digest,page.length,1);checks++;
  rejects(()->ContentPolicy.descriptor(1,2,1,1,1,2,1,"a".repeat(40),digest,page.length),"contract");
  rejects(()->ContentPolicy.descriptor(1,1,1,1,2,3,1,"a".repeat(40),digest,page.length),"APK compatibility");
  rejects(()->ContentPolicy.descriptor(1,1,1,1,1,2,1,"master",digest,page.length),"moving branch");
  rejects(()->ContentPolicy.descriptor(1,1,1,1,1,2,1,"a".repeat(40),digest,ContentPolicy.MAX_BYTES+1L),"oversize");
  rejects(()->ContentPolicy.descriptor(2,1,1,1,1,2,1,"a".repeat(40),digest,page.length),"schema");
  rejects(()->ContentPolicy.descriptor(1,1,1,0,1,2,1,"a".repeat(40),digest,page.length),"version");
  rejects(()->ContentPolicy.verify(page,"0".repeat(64),page.length,1),"hash");
  rejects(()->ContentPolicy.verify(page,digest,page.length+1,1),"truncated download");
  byte[] mutable=bytes(new String(page,"UTF-8").replace("6774794aa0a6fe09d1af5433119b5029d720ff43","master"));
  rejects(()->ContentPolicy.verify(mutable,sha(mutable),mutable.length,1),"mutable assets");
  byte[] legacy=bytes(new String(page,"UTF-8").replace("window.URTV_READY = true;",""));
  rejects(()->ContentPolicy.verify(legacy,sha(legacy),legacy.length,1),"legacy page");
  dir=new File(a[0],"content");
  check(store().choose()==null,"first run must use APK");
  byte[] one=bytes("good version one"),two=bytes("good version two"),three=bytes("candidate version three");
  store().stage(one,sha(one),1);File first=store().choose();store().healthy(first);
  check(store().choose().equals(first),"known good across process recreation");
  // Incomplete download/metadata never changes the selected page.
  Files.write(new File(dir,"download.tmp").toPath(),bytes("partial"));
  Files.write(new File(dir,"state.tmp").toPath(),bytes("candidate=partial"));
  check(store().choose().equals(first),"interrupted writes leave good content");
  store().stage(two,sha(two),2);File second=store().choose();store().healthy(second);
  check(store().choose().equals(second),"promotion after healthy render");
  store().stage(three,sha(three),3);store().choose();
  check(store().choose().equals(second),"process death/reboot before acknowledgement rolls back");
  check(!store().canStage(3,sha(three)),"do not repeat failed update");
  check(!store().canStage(1,sha(one)),"reject downgrade");
  store().rollback();check(store().choose().equals(first),"manual last-good rollback");
  check(!store().canStage(9,sha(two)),"block same failed hash even with new version");
  byte[] pending=bytes("new pending fourth");store().stage(pending,sha(pending),4);store().rollback();
  check(store().choose().equals(first),"manual pending rollback preserves current good");
  store().stage(two,sha(two),5); // blocked hash remains refused
  check(store().choose().equals(first),"rejected hash leaves current content");
  byte[] four=bytes("new good four");store().stage(four,sha(four),6);
  File fourth=store().choose();store().reject(fourth);
  check(store().choose().equals(first),"failed WebView readiness restores good");
  Files.write(first.toPath(),bytes("storage corruption"));
  check(store().choose()==null,"bad stored hash falls back to packaged page");
  Files.write(new File(dir,"state.properties").toPath(),bytes("active=invalid"));
  rejects(()->store(),"corrupt pointer must be rejected for packaged fallback");
  // A different native APK has no inherited content state.
  dir=new File(a[0],"next-apk");check(store().choose()==null,"new APK uses packaged content first");
  System.out.println("PASS "+checks+" stable-content policy, interruption, reboot and rollback checks");
 }
}
'''
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);src=root/'ContentHarness.java';src.write_text(harness)
            subprocess.run(['java','-m','jdk.compiler/com.sun.tools.javac.Main','-d',tmp,
                            str(JAVA/'ContentPolicy.java'),str(JAVA/'ContentStore.java'),str(src)],check=True)
            r=subprocess.run(['java','-cp',tmp,'sa.urtv.screensaver.ContentHarness',tmp,str(ROOT/'dist/urtv.html')],capture_output=True,text=True)
            self.assertEqual(r.returncode,0,r.stdout+r.stderr);print(r.stdout.strip())

if __name__=='__main__':unittest.main(verbosity=2)
